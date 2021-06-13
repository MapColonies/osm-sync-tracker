import { Logger } from '@map-colonies/js-logger';
import lodash from 'lodash';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { IFileRepository, fileRepositorySymbol } from '../../file/DAL/fileRepository';
import { FileNotFoundError } from '../../file/models/errors';
import { IEntityRepository, entityRepositorySymbol } from '../DAL/entityRepository';
import { Entity, UpdateEntities, UpdateEntity } from './entity';
import { DuplicateEntityError, EntityAlreadyExistsError, EntityNotFoundError } from './errors';

@injectable()
export class EntityManager {
  public constructor(
    @inject(entityRepositorySymbol) private readonly entityRepository: IEntityRepository,
    @inject(fileRepositorySymbol) private readonly fileRepository: IFileRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

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

  public async createEntities(fileId: string, entities: Entity[]): Promise<void> {
    const entitiesWithFileId = entities.map((entity) => ({ ...entity, fileId }));
    const fileEntity = await this.fileRepository.findOneFile(fileId);
    const dup = lodash.uniqBy(entities, 'entityId');

    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    if (dup.length !== entities.length) {
      throw new DuplicateEntityError(`entites = [${dup.map((entity) => entity.entityId).toString()}] are duplicate`);
    }

    const entityEntities = await this.entityRepository.findManyEntites(entitiesWithFileId);
    if (entityEntities) {
      throw new EntityAlreadyExistsError(`entities = [${entities.map((entity) => entity.entityId).toString()}] already exists`);
    }

    await this.entityRepository.createEntities(entitiesWithFileId);
  }

  public async updateEntity(fileId: string, entityId: string, entity: UpdateEntity): Promise<void> {
    const fileEntity = await this.fileRepository.findOneFile(fileId);
    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    const entityEntity = await this.entityRepository.findOneEntity(entityId, fileId);
    if (!entityEntity) {
      throw new EntityNotFoundError(`entity = ${entityId} not found`);
    }

    await this.entityRepository.updateEntity(entityId, fileId, entity);
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
  }
}
