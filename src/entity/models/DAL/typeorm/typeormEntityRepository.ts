import { EntityRepository, Repository } from 'typeorm';
import { Entity, UpdateEntity } from '../../models/entity';
import { EntityRepository as EntityRepo } from '../entityRepository';
import { Entity as EntityDb } from './entity';

@EntityRepository(EntityDb)
export class TypeormEntityRepository extends Repository<EntityDb> implements EntityRepo {
  public async createEntity(entity: Entity): Promise<void> {
    await this.save(entity);
  }

  public async createEntities(entities: Entity[]): Promise<void> {
    await this.save(entities);
  }

  public async updateEntity(entityId: string, entity: UpdateEntity): Promise<void> {
    await this.update(entityId, entity);
  }
}
