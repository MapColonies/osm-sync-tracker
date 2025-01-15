import { DataSource } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { DATA_SOURCE_PROVIDER } from '../../common/db';
import { EntityStatus } from '../../common/enums';
import { Entity } from '../../entity/DAL/entity';
import { Changeset, UpdateChangeset } from '../models/changeset';
import { Changeset as ChangesetDb } from './changeset';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createChangesetRepository = (dataSource: DataSource) => {
  return dataSource.getRepository(ChangesetDb).extend({
    async createChangeset(changeset: Changeset): Promise<void> {
      await this.insert(changeset);
    },

    async updateChangeset(changesetId: string, changeset: UpdateChangeset): Promise<void> {
      await this.update(changesetId, changeset);
    },

    async updateEntitiesOfChangesetAsCompleted(changesetId: string): Promise<void> {
      await this.createQueryBuilder()
        .update(Entity)
        .set({ status: EntityStatus.COMPLETED })
        .where(`changesetId = :changesetId`, { changesetId })
        .execute();
    },

    async findOneChangeset(changesetId: string): Promise<ChangesetDb | undefined> {
      const changesetEntity = await this.findOne({ where: { changesetId } });
      if (changesetEntity === null) {
        return undefined;
      }
      return changesetEntity;
    },
  });
};

export type ChangesetRepository = ReturnType<typeof createChangesetRepository>;

export const changesetRepositoryFactory: FactoryFunction<ChangesetRepository> = (depContainer) => {
  return createChangesetRepository(depContainer.resolve<DataSource>(DATA_SOURCE_PROVIDER));
};

export const CHANGESET_CUSTOM_REPOSITORY_SYMBOL = Symbol('CHANGESET_CUSTOM_REPOSITORY_SYMBOL');
