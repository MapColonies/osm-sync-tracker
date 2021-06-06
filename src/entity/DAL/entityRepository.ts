import { Entity, UpdateEntity } from '../models/entity';
import { Entity as EntityDb } from './typeorm/entity';

export const entityRepositorySymbol = Symbol('EntityRepository');
export interface IEntityRepository {
  createEntity: (entity: Entity) => Promise<void>;

  createEntities: (entities: Entity[]) => Promise<void>;

  updateEntity: (entityId: string, entity: UpdateEntity) => Promise<void>;

  findOneEntity: (entityId: string) => Promise<EntityDb | undefined>;

  findManyEntites: (entities: Entity[]) => Promise<EntityDb[] | undefined>;
}
