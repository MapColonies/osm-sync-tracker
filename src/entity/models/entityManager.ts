import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { EntityRepository, entityRepositorySymbol } from '../DAL/entityRepository';
import { Entity, UpdateEntity } from './entity';

@injectable()
export class EntityManager {
  public constructor(
    @inject(entityRepositorySymbol) private readonly entityRepository: EntityRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createEntity(entity: Entity): Promise<void> {
    entity.entityId.substring(1, entity.entityId.length);
    await this.entityRepository.createEntity(entity);
  }

  public async createEntities(entities: Entity[]): Promise<void> {
    await this.entityRepository.createEntities(entities);
  }

  public async updateEntity(entityId: string, entity: UpdateEntity): Promise<void> {
    await this.entityRepository.updateEntity(entityId, entity);
  }
}
