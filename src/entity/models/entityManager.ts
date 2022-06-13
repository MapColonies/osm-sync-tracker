import { Logger } from '@map-colonies/js-logger';
import lodash from 'lodash';
import { inject, injectable } from 'tsyringe';
import { TransactionFailureError } from '../../changeset/models/errors';
import { SERVICES } from '../../common/constants';
import { EntityStatus } from '../../common/enums';
import { IApplication, IConfig, TransactionRetryPolicy } from '../../common/interfaces';
import { retryFunctionWrapper } from '../../common/utils/retryFunctionWrapper';
import { FileRepository, FILE_CUSTOM_REPOSITORY_SYMBOL } from '../../file/DAL/fileRepository';
import { FileNotFoundError } from '../../file/models/errors';
import { SyncRepository, SYNC_CUSTOM_REPOSITORY_SYMBOL } from '../../sync/DAL/syncRepository';
import { EntityRepository, ENTITY_CUSTOM_REPOSITORY_SYMBOL } from '../DAL/entityRepository';
import { Entity, UpdateEntities, UpdateEntity } from './entity';
import { DuplicateEntityError, EntityAlreadyExistsError, EntityNotFoundError } from './errors';

export interface EntityBulkCreationResult {
  created: string[];
  previouslyCompleted: string[];
}

@injectable()
export class EntityManager {
  private readonly dbSchema: string;
  private readonly transactionRetryPolicy: TransactionRetryPolicy;

  public constructor(
    @inject(ENTITY_CUSTOM_REPOSITORY_SYMBOL) private readonly entityRepository: EntityRepository,
    @inject(FILE_CUSTOM_REPOSITORY_SYMBOL) private readonly fileRepository: FileRepository,
    @inject(SYNC_CUSTOM_REPOSITORY_SYMBOL) private readonly syncRepository: SyncRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.APPLICATION) private readonly appConfig: IApplication
  ) {
    this.dbSchema = this.config.get('db.schema');
    this.transactionRetryPolicy = this.appConfig.transactionRetryPolicy;
  }

  public async createEntity(fileId: string, entity: Entity): Promise<void> {
    this.logger.info({ msg: 'creating entity on file', fileId, entityId: entity.entityId });

    const fileEntity = await this.fileRepository.findOneFile(fileId);
    const entityWithFileId = { fileId, ...entity };

    if (!fileEntity) {
      this.logger.error({ msg: 'could not create entity due to file not existing', fileId, entityId: entity.entityId });
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    const entityEntity = await this.entityRepository.findOneEntity(entity.entityId, fileId);
    if (entityEntity) {
      this.logger.error({ msg: 'could not create entity due to entity with the same id already existing', fileId, entityId: entity.entityId });
      throw new EntityAlreadyExistsError(`entity = ${entity.entityId} already exists`);
    }

    await this.entityRepository.createEntity(entityWithFileId);
  }

  public async createEntities(fileId: string, entitiesForCreation: Entity[]): Promise<EntityBulkCreationResult> {
    this.logger.info({ msg: 'bulk creating entities on file', fileId, entityCount: entitiesForCreation.length });

    const fileEntity = await this.fileRepository.findOneFile(fileId);

    if (!fileEntity) {
      this.logger.error({ msg: 'could not bulk create entities on file due to file not existing', fileId, entityCount: entitiesForCreation.length });
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    const entitiesWithFileId = entitiesForCreation.map((entity) => ({ ...entity, fileId }));
    const entityIdsForCreation = entitiesWithFileId.map((entity) => entity.entityId);
    const duplicateEntities = lodash.filter(entityIdsForCreation, (entityId, i, iteratee) => lodash.includes(iteratee, entityId, i + 1));
    if (duplicateEntities.length > 0) {
      this.logger.error({
        msg: 'could not bulk create entities on file, due to request having duplicated entities',
        duplicateEntities,
        duplicateEntitiesCount: duplicateEntities.length,
      });
      throw new DuplicateEntityError(`entites = [${duplicateEntities.toString()}] are duplicate`);
    }

    let result: EntityBulkCreationResult = { created: entityIdsForCreation, previouslyCompleted: [] };

    const existingEntities = await this.entityRepository.findManyEntities(entitiesWithFileId);

    // check if the entities creation is done on a rerun or not
    const reruns = await this.syncRepository.findSyncs({ baseSyncId: fileEntity.syncId });

    if (reruns.length === 0) {
      // not a rerun so the entities should not exist
      if (existingEntities) {
        const existingEntityIds = existingEntities.map((entity) => entity.entityId);
        this.logger.error({
          msg: 'could not bulk create entities on file due to having at least one entity which already exists',
          fileId,
          entityCount: entitiesForCreation.length,
          existingEntitiesCount: existingEntities.length,
          existingEntityIds,
        });
        throw new EntityAlreadyExistsError(`entities = [${existingEntityIds.toString()}] already exists`);
      }

      await this.entityRepository.createEntities(entitiesWithFileId);
      return result;
    }

    let entitiesForUpsert = entitiesWithFileId;
    if (existingEntities) {
      // non existing are the difference between the entities for creation and the existing entities
      const nonExistingEntityIds = lodash.difference(
        entityIdsForCreation,
        existingEntities.map((existingEntity) => existingEntity.entityId)
      );

      // entities for update are the existing entities with inrerun status
      const existingEntityIdsForRerun = existingEntities.filter((entity) => entity.status === EntityStatus.IN_RERUN).map((entity) => entity.entityId);

      // both arrays are for upsert, filter the relevant entities
      entitiesForUpsert = entitiesWithFileId.filter((entityForCreation) =>
        [...nonExistingEntityIds, ...existingEntityIdsForRerun].includes(entityForCreation.entityId)
      );

      // previously completed are the difference between the payload and the ones for upsert
      const entitiesForUpsertIds = entitiesForUpsert.map((entityForUpsert) => entityForUpsert.entityId);
      const previouslyCompletedEntities = lodash.difference(entityIdsForCreation, entitiesForUpsertIds);
      result = { created: entitiesForUpsertIds, previouslyCompleted: previouslyCompletedEntities };
    }
    await this.entityRepository.updateEntities(entitiesForUpsert);

    this.logger.debug({ msg: 'bulk create entities on rerun resulted in', result, fileId, baseSyncId: fileEntity.syncId });

    return result;
  }

  public async updateEntity(fileId: string, entityId: string, entity: UpdateEntity): Promise<string[]> {
    this.logger.info({ msg: 'updating entity', fileId, entityId });

    const fileEntity = await this.fileRepository.findOneFile(fileId);
    if (!fileEntity) {
      this.logger.error({ msg: 'could not create entity on file due to file not existing', fileId, entityId });
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    const entityEntity = await this.entityRepository.findOneEntity(entityId, fileId);
    if (!entityEntity) {
      this.logger.error({ msg: 'could not create entity due to entity with the same id already existing', fileId, entityId });
      throw new EntityNotFoundError(`entity = ${entityId} not found`);
    }

    await this.entityRepository.updateEntity(entityId, fileId, entity);

    let completedSyncIds: string[] = [];
    if (entity.status === EntityStatus.NOT_SYNCED) {
      completedSyncIds = await this.closeFile(fileId);

      this.logger.debug({
        msg: 'updating entity resulted in the complition of following syncs',
        entityId,
        fileId,
        completedSyncIds,
        completedSyncsCount: completedSyncIds.length,
      });
    }

    return completedSyncIds;
  }

  public async updateEntities(entities: UpdateEntities): Promise<void> {
    this.logger.info({ msg: 'updating entities', entitiesCount: entities.length });

    const uniqueEntityIds = lodash.uniqBy(entities, 'entityId');

    if (uniqueEntityIds.length !== entities.length) {
      this.logger.error({
        msg: 'could not update entity due to request having duplicate entities',
        entitiesCount: entities.length,
        uniqueEntitiesCount: uniqueEntityIds.length,
      });
      throw new DuplicateEntityError(`entites = [${uniqueEntityIds.map((entity) => entity.entityId).toString()}] are duplicate`);
    }

    const entityCount = await this.entityRepository.countEntitiesByIds(
      entities.map((entity) => entity.entityId),
      entities.map((entity) => entity.fileId)
    );

    if (entityCount !== entities.length) {
      this.logger.error({
        msg: 'could not update entity due to at least one entity not existing',
        existingCount: entityCount,
        requestedCount: entities.length,
      });
      throw new EntityNotFoundError(`One of the entities was not found`);
    }

    await this.entityRepository.updateEntities(entities);
    await Promise.all(entities.filter((entity) => entity.status === EntityStatus.NOT_SYNCED).map(async (entity) => this.closeFile(entity.fileId)));
  }

  private async closeFile(fileId: string): Promise<string[]> {
    this.logger.info({ msg: 'attempting to close file', fileId, transactionRetryPolicy: this.transactionRetryPolicy });

    if (!this.transactionRetryPolicy.enabled) {
      return this.fileRepository.tryClosingFile(fileId, this.dbSchema);
    }
    const retryOptions = { retryErrorType: TransactionFailureError, numberOfRetries: this.transactionRetryPolicy.numRetries as number };
    const functionRef = this.fileRepository.tryClosingFile.bind(this.fileRepository);
    return retryFunctionWrapper(retryOptions, functionRef, fileId, this.dbSchema);
  }
}
