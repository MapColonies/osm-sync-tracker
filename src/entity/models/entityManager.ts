import { Logger } from '@map-colonies/js-logger';
import lodash from 'lodash';
import { inject, injectable } from 'tsyringe';
import { TransactionFailureError } from '../../changeset/models/errors';
import { SERVICES } from '../../common/constants';
import { EntityStatus } from '../../common/enums';
import { IApplication, IConfig, TransactionRetryPolicy } from '../../common/interfaces';
import { retryFunctionWrapper } from '../../common/utils/retryFunctionWrapper';
import { IFileRepository, fileRepositorySymbol } from '../../file/DAL/fileRepository';
import { FileNotFoundError } from '../../file/models/errors';
import { IRerunRepository, rerunRepositorySymbol } from '../../sync/DAL/rerunRepository';
import { IEntityRepository, entityRepositorySymbol } from '../DAL/entityRepository';
import { Entity, UpdateEntities, UpdateEntity } from './entity';
import { DuplicateEntityError, EntityAlreadyExistsError, EntityNotFoundError } from './errors';

@injectable()
export class EntityManager {
  private readonly dbSchema: string;
  private readonly transactionRetryPolicy: TransactionRetryPolicy;

  public constructor(
    @inject(entityRepositorySymbol) private readonly entityRepository: IEntityRepository,
    @inject(fileRepositorySymbol) private readonly fileRepository: IFileRepository,
    @inject(rerunRepositorySymbol) private readonly rerunRepository: IRerunRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.APPLICATION) private readonly appConfig: IApplication
  ) {
    this.dbSchema = this.config.get('db.schema');
    this.transactionRetryPolicy = this.appConfig.transactionRetryPolicy;
  }

  public async createEntity(fileId: string, entity: Entity): Promise<void> {
    const fileEntity = await this.fileRepository.findOneFile(fileId);
    const entityWithFileId = { fileId, ...entity };

    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    const entityEntity = await this.entityRepository.findOneEntity(entity.entityId, fileId);
    if (entityEntity) {
      throw new EntityAlreadyExistsError(`entity = ${entity.entityId} already exists`);
    }

    await this.entityRepository.createEntity(entityWithFileId);
  }

  public async createEntities(fileId: string, entitiesForCreation: Entity[]): Promise<void> {
    const entitiesWithFileId = entitiesForCreation.map((entity) => ({ ...entity, fileId }));
    const fileEntity = await this.fileRepository.findOneFile(fileId);

    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    const entityIdsForCreation = entitiesWithFileId.map((entity) => entity.entityId);
    const duplicateEntities = lodash.filter(entityIdsForCreation, (entityId, i, iteratee) => lodash.includes(iteratee, entityId, i + 1));
    if (duplicateEntities.length > 0) {
      throw new DuplicateEntityError(`entites = [${duplicateEntities.toString()}] are duplicate`);
    }

    const existingEntities = await this.entityRepository.findManyEntites(entitiesWithFileId);

    const reruns = await this.rerunRepository.findReruns({ referenceId: fileEntity.syncId });

    if (reruns.length === 0) {
      if (existingEntities) {
        throw new EntityAlreadyExistsError(`entities = [${existingEntities.map((entity) => entity.entityId).toString()}] already exists`);
      }

      await this.entityRepository.createEntities(entitiesWithFileId);
    } else {
      let entitiesForUpsert = entitiesWithFileId;
      if (existingEntities) {
        // non existing are the difference between the entities for creation and the existing entities
        const nonExistingEntityIds = lodash.difference(
          entityIdsForCreation,
          existingEntities.map((existingEntity) => existingEntity.entityId)
        );

        // entities for update are the existing entities with inrerun status
        const existingEntityIdsForRerun = existingEntities
          .filter((entity) => entity.status === EntityStatus.IN_RERUN)
          .map((entity) => entity.entityId);

        // both arrays are for upsert, filter the relevant entities
        entitiesForUpsert = entitiesWithFileId.filter((entityForCreation) =>
          [...nonExistingEntityIds, ...existingEntityIdsForRerun].includes(entityForCreation.entityId)
        );
      }
      await this.entityRepository.updateEntities(entitiesForUpsert);
    }
  }

  public async updateEntity(fileId: string, entityId: string, entity: UpdateEntity): Promise<string[]> {
    const fileEntity = await this.fileRepository.findOneFile(fileId);
    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    const entityEntity = await this.entityRepository.findOneEntity(entityId, fileId);
    if (!entityEntity) {
      throw new EntityNotFoundError(`entity = ${entityId} not found`);
    }

    await this.entityRepository.updateEntity(entityId, fileId, entity);

    let completedSyncIds: string[] = [];
    if (entity.status === EntityStatus.NOT_SYNCED) {
      completedSyncIds = await this.closeFile(fileId);
    }
    return completedSyncIds;
  }

  public async updateEntities(entities: UpdateEntities): Promise<void> {
    const dup = lodash.uniqBy(entities, 'entityId');

    if (dup.length !== entities.length) {
      throw new DuplicateEntityError(`entites = [${dup.map((entity) => entity.entityId).toString()}] are duplicate`);
    }

    const entityCount = await this.entityRepository.countEntitiesByIds(
      entities.map((entity) => entity.entityId),
      entities.map((entity) => entity.fileId)
    );

    if (entityCount !== entities.length) {
      throw new EntityNotFoundError(`One of the entities was not found`);
    }

    await this.entityRepository.updateEntities(entities);
    await Promise.all(entities.filter((entity) => entity.status === EntityStatus.NOT_SYNCED).map(async (entity) => this.closeFile(entity.fileId)));
  }

  private async closeFile(fileId: string): Promise<string[]> {
    if (!this.transactionRetryPolicy.enabled) {
      return this.fileRepository.tryClosingFile(fileId, this.dbSchema);
    }
    const retryOptions = { retryErrorType: TransactionFailureError, numberOfRetries: this.transactionRetryPolicy.numRetries as number };
    const functionRef = this.fileRepository.tryClosingFile.bind(this.fileRepository);
    return retryFunctionWrapper(retryOptions, functionRef, fileId, this.dbSchema);
  }
}
