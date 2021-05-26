import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { FileRepository, fileRepositorySymbol } from '../../file/DAL/fileRepository';
import { FileNotFoundError } from '../../file/models/errors';
import { EntityRepository, entityRepositorySymbol } from '../DAL/entityRepository';
import { Entity, UpdateEntity } from './entity';

@injectable()
export class EntityManager {
  public constructor(
    @inject(entityRepositorySymbol) private readonly entityRepository: EntityRepository,
    @inject(fileRepositorySymbol) private readonly fileRepository: FileRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createEntity(entity: Entity): Promise<void> {
    const fileEntity = await this.fileRepository.findOne(entity.fileId);
    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${entity.fileId} not found`);
    }
    await this.entityRepository.createEntity(entity);
  }

  public async createEntities(entities: Entity[]): Promise<void> {
    const fileEntity = await this.fileRepository.findOne(entities[0].fileId);
    if (!fileEntity) {
      throw new FileNotFoundError(`file = ${entities[0].fileId} not found`);
    }
    await this.entityRepository.createEntities(entities);
  }

  public async updateEntity(entityId: string, entity: UpdateEntity): Promise<void> {
    await this.entityRepository.updateEntity(entityId, entity);
  }
}
