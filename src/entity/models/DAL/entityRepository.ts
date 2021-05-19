import { Entity, UpdateEntity } from '../models/entity';

export const entityRepositorySymbol = Symbol('EntityRepository');
export interface EntityRepository {
  createEntity: (entity: Entity) => Promise<void>;
  createEntities: (entities: Entity[]) => Promise<void>;
  updateEntity: (entityId: string, entity: UpdateEntity) => Promise<void>;
}
