import { EntityRepository, Repository } from 'typeorm';
import { Entity, UpdateEntity } from '../../models/entity';
import { EntityAlreadyExistsError } from '../../models/errors';
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
    await this.save(entities);
  }

  public async updateEntity(entityId: string, entity: UpdateEntity): Promise<void> {
    const entityEntity = await this.findOne(entity);
    if (!entityEntity) {
      throw new EntityAlreadyExistsError(`entity = ${entityId} not found`);
    }
    await this.update(entityId, entity);
  }
}
