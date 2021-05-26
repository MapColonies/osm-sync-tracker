import { EntityRepository, Repository } from 'typeorm';
import { Entity, UpdateEntity } from '../../models/entity';
import { EntityAlreadyExistsError, EntityNotFoundError } from '../../models/errors';
import { EntityRepository as EntityRepo } from '../entityRepository';
import { Entity as EntityDb } from './entity';

@EntityRepository(EntityDb)
export class TypeormEntityRepository extends Repository<EntityDb> implements EntityRepo {
  public async createEntity(entity: Entity): Promise<void> {
    const entityEntity = await this.findOne(entity);
    if (entityEntity) {
      throw new EntityAlreadyExistsError(`entity = ${entity.entityId} already exists`);
    }
    await this.insert(entity);
  }

  public async createEntities(entities: Entity[]): Promise<void> {
    const entityEntities = await this.findByIds(entities);
    if (entityEntities.length > 0) {
      throw new EntityAlreadyExistsError(`entities = [${entityEntities.map((entity) => entity.entityId).toString()}] already exists`);
    }
    await this.insert(entities);
  }

  public async updateEntity(entityId: string, entity: UpdateEntity): Promise<void> {
    const entityEntity = await this.findOne(entity);
    if (!entityEntity) {
      throw new EntityNotFoundError(`entity = ${entityId} not found`);
    }
    await this.update(entityId, entity);
  }
}
