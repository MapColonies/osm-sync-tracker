import { Logger } from '@map-colonies/js-logger';
import _ from 'lodash';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { FileRepository, fileRepositorySymbol } from '../../file/DAL/fileRepository';
import { FileNotFoundError } from '../../file/models/errors';
import { EntityRepository, entityRepositorySymbol } from '../DAL/entityRepository';
import { Entity, UpdateEntity } from './entity';
import { EntityAlreadyExistsError, EntityNotFoundError } from './errors';

@injectable()
export class EntityManager {
  public constructor(
    @inject(entityRepositorySymbol) private readonly entityRepository: EntityRepository,
    @inject(fileRepositorySymbol) private readonly fileRepository: FileRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createEntity(entity: Entity): Promise<void> {
    const fileEntity = await this.fileRepository.findOneFile(entity.fileId);
    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${entity.fileId} not found`);
    }

    const entityEntity = await this.entityRepository.findOneEntity(entity.entityId);
    if (entityEntity) {
      throw new EntityAlreadyExistsError(`entity = ${entity.entityId} already exists`);
    }

    await this.entityRepository.createEntity(entity);
  }

  public async createEntities(entities: Entity[]): Promise<void> {
    const fileEntity = await this.fileRepository.findOneFile(entities[0].fileId);
    const dup = _.uniqBy(entities, 'entityId');

    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${entities[0].fileId} not found`);
    }

    if (dup.length !== entities.length) {
      throw new EntityAlreadyExistsError(`files = [${entities.map((file) => file.fileId).toString()}] already exists`);
    }

    const entityEntities = await this.entityRepository.findManyEntites(entities);
    if (entityEntities) {
      throw new EntityAlreadyExistsError(`entities = [${entities.map((entity) => entity.entityId).toString()}] already exists`);
    }

    await this.entityRepository.createEntities(entities);
  }

  public async updateEntity(fileId: string, entityId: string, entity: UpdateEntity): Promise<void> {
    const fileEntity = await this.fileRepository.findOneFile(fileId);
    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    const entityEntity = await this.entityRepository.findOneEntity(entityId);
    if (!entityEntity) {
      throw new EntityNotFoundError(`entity = ${entityId} not found`);
    }

    await this.entityRepository.updateEntity(entityId, entity);
  }
}
