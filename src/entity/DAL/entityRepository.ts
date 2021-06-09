import { Entity, UpdateEntities, UpdateEntity } from '../models/entity';
import { Entity as EntityDb } from './typeorm/entity';

export const entityRepositorySymbol = Symbol('EntityRepository');
export interface IEntityRepository {
  createEntity: (entity: Entity) => Promise<void>;

  createEntities: (entities: Entity[]) => Promise<void>;

  updateEntity: (entityId: string, entity: UpdateEntity) => Promise<void>;

  updateEntities: (entities: UpdateEntities) => Promise<void>;

  findOneEntity: (entityId: string) => Promise<EntityDb | undefined>;

  findManyEntites: (entities: Entity[]) => Promise<EntityDb[] | undefined>;

  countEntitiesByIds: (entityIds: string[]) => Promise<number>;
}
