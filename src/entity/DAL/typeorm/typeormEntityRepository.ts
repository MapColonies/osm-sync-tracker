import { EntityRepository, Repository } from 'typeorm';
import { Entity, UpdateEntity } from '../../models/entity';
import { EntityRepository as EntityRepo } from '../entityRepository';
import { Entity as EntityDb } from './entity';

@EntityRepository(EntityDb)
export class TypeormEntityRepository extends Repository<EntityDb> implements EntityRepo {
  public async createEntity(entity: Entity): Promise<void> {
    await this.insert(entity);
  }

  public async createEntities(entities: Entity[]): Promise<void> {
    await this.insert(entities);
  }

  public async updateEntity(entityId: string, entity: UpdateEntity): Promise<void> {
    await this.update(entityId, entity);
  }

  public async findOneEntity(entityId: string): Promise<EntityDb | undefined> {
    const entityEntity = await this.findOne(entityId);
    if (entityEntity === undefined) {
      return undefined;
    }
    return entityEntity;
  }

  public async findManyEntites(entities: Entity[]): Promise<EntityDb[] | undefined> {
    const entityEntities = await this.findByIds(entities);
    if (entityEntities.length === 0) {
      return undefined;
    }
    return entityEntities;
  }
}
