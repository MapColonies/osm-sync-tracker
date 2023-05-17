import { In, DataSource } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { Entity, UpdateEntities, UpdateEntity } from '../models/entity';
import { Entity as EntityDb } from './entity';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createEntityRepository = (dataSource: DataSource) => {
  return dataSource.getRepository(EntityDb).extend({
    async createEntity(entity: Entity): Promise<void> {
      await this.insert(entity);
    },

    async createEntities(entities: Entity[]): Promise<void> {
      await this.insert(entities);
    },

    async updateEntity(entityId: string, fileId: string, entity: UpdateEntity): Promise<void> {
      await this.update({ entityId, fileId }, entity);
    },

    async updateEntities(entities: UpdateEntities): Promise<void> {
      await this.save(entities);
    },

    async findOneEntity(entityId: string, fileId: string): Promise<EntityDb | undefined> {
      const entityEntity = await this.findOne({ where: { entityId, fileId } });
      if (entityEntity === null) {
        return undefined;
      }
      return entityEntity;
    },

    async findManyEntitiesByIds(entities: Entity[]): Promise<EntityDb[] | undefined> {
      // due to both entityId and fileId being unique uuids this operation is valid
      const entityEntities = await this.findBy({ entityId: In(entities.map((e) => e.entityId)), fileId: In(entities.map((e) => e.fileId)) });
      if (entityEntities.length === 0) {
        return undefined;
      }
      return entityEntities;
    },

    async countEntitiesByIds(ids: Pick<Entity, 'entityId' | 'fileId'>[]): Promise<number> {
      return this.createQueryBuilder().whereInIds(ids).getCount();
    },
  });
};

export type EntityRepository = ReturnType<typeof createEntityRepository>;

export const entityRepositoryFactory: FactoryFunction<EntityRepository> = (depContainer) => {
  return createEntityRepository(depContainer.resolve<DataSource>(DataSource));
};

export const ENTITY_CUSTOM_REPOSITORY_SYMBOL = Symbol('ENTITY_CUSTOM_REPOSITORY_SYMBOL');
