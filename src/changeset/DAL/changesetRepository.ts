import client from 'prom-client';
import { EntityManager, DataSource } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { nanoid } from 'nanoid';
import { isTransactionFailure, ReturningId, ReturningResult, TransactionName } from '../../common/db';
import { EntityStatus, Status } from '../../common/enums';
import { Entity } from '../../entity/DAL/entity';
import { Changeset, UpdateChangeset } from '../models/changeset';
import { SERVICES } from '../../common/constants';
import { TransactionFailureError } from '../models/errors';
import { SyncDb } from '../../sync/DAL/sync';
import { getIsolationLevel } from '../../common/utils/db';
import { Changeset as ChangesetDb } from './changeset';

async function updateLastRerunAsCompleted(syncId: string, transactionalEntityManager: EntityManager): Promise<void> {
  const completedSyncWithLastRerun = await transactionalEntityManager
    .createQueryBuilder(SyncDb, 'sync')
    .leftJoinAndSelect('sync.reruns', 'rerun')
    .where('sync.id = :syncId', { syncId })
    .orderBy('rerun.run_number', 'DESC')
    .limit(1)
    .getOne();

  if (completedSyncWithLastRerun === null || completedSyncWithLastRerun.reruns.length <= 0) {
    return;
  }

  const lastRerun = completedSyncWithLastRerun.reruns[0];
  await transactionalEntityManager.update(SyncDb, { id: lastRerun.id }, { status: Status.COMPLETED, endDate: completedSyncWithLastRerun.endDate });
}

async function updateEntitiesOfChangesetAsCompletedInTransaction(changesetId: string, transactionalEntityManager: EntityManager): Promise<void> {
  await transactionalEntityManager
    .createQueryBuilder()
    .update(Entity)
    .set({ status: EntityStatus.COMPLETED })
    .where(`changesetId = :changesetId`, { changesetId })
    .execute();
}

async function updateFileAsCompleted(
  changesetIds: string[],
  schema: string,
  transactionalEntityManager: EntityManager
): Promise<ReturningResult<ReturningId>> {
  return (await transactionalEntityManager.query(
    `WITH touched_files AS (
      SELECT DISTINCT file_id
      FROM ${schema}.entity
      WHERE changeset_id = ANY($1))

    UPDATE ${schema}.file AS FILE SET status = 'completed', end_date = LOCALTIMESTAMP
    FROM (
      SELECT file_id, COUNT(*) AS CompletedEntities
      FROM ${schema}.entity
      WHERE file_id IN (SELECT * FROM touched_files) AND (status = 'completed' or status = 'not_synced')
      GROUP BY file_id) AS FILES_TO_UPDATE
    WHERE FILE.file_id = FILES_TO_UPDATE.file_id AND FILES_TO_UPDATE.CompletedEntities = FILE.total_entities AND FILE.status != 'completed'
    RETURNING FILE.file_id AS id`,
    [changesetIds]
  )) as ReturningResult<ReturningId>;
}

async function updateSyncAsCompleted(changesetIds: string[], schema: string, transactionalEntityManager: EntityManager): Promise<void> {
  await transactionalEntityManager.query(
    `WITH touched_files AS (
    SELECT DISTINCT file_id
    FROM ${schema}.entity
    WHERE changeset_id = ANY($1))

  UPDATE ${schema}.sync AS sync_to_update SET status = 'completed', end_date = LOCALTIMESTAMP
  FROM (
    SELECT DISTINCT sync_id
    FROM ${schema}.file
    WHERE file_id IN (SELECT * FROM touched_files) AND status = 'completed') AS sync_from_changeset
  WHERE sync_to_update.id = sync_from_changeset.sync_id AND sync_to_update.total_files = (SELECT COUNT(*) FROM ${schema}.file WHERE sync_id = sync_to_update.id AND status = 'completed')`,
    [changesetIds]
  );
}

async function updateSyncAsCompletedByFiles(
  fileIds: string[],
  schema: string,
  transactionalEntityManager: EntityManager
): Promise<ReturningResult<ReturningId>> {
  return (await transactionalEntityManager.query(
    `UPDATE ${schema}.sync AS sync_to_update SET status = 'completed', end_date = LOCALTIMESTAMP
  FROM (
    SELECT DISTINCT sync_id
    FROM ${schema}.file
    WHERE file_id = ANY($1)) AS sync_from_files
  WHERE sync_to_update.id = sync_from_files.sync_id AND sync_to_update.total_files = (SELECT COUNT(*) FROM ${schema}.file WHERE sync_id = sync_to_update.id AND status = 'completed')
  RETURNING sync_to_update.id`,
    [fileIds]
  )) as ReturningResult<ReturningId>;
}

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

    async tryClosingChangesets(
      changesetIds: string[],
      schema: string,
      changesetCounter: client.Counter<'status' | 'changesetid'>
    ): Promise<string[]> {
      const isolationLevel = getIsolationLevel();
      const transaction = { transactionId: nanoid(), transactionName: TransactionName.TRY_CLOSING_CHANGESETS, isolationLevel };
      logger.debug({
        msg: 'attempting to close changests in multiple step transaction',
        changesetIds,
        changesetsCount: changesetIds.length,
        transaction,
      });

      try {
        return await this.manager.connection.transaction(isolationLevel, async (transactionalEntityManager) => {
          let completedSyncIds: string[] = [];
          const completedFilesResult = await updateFileAsCompleted(changesetIds, schema, transactionalEntityManager);

          logger.debug({ msg: 'updated file as completed resulted in', completedFilesResult, changesetIds, transaction });

          // check if there are any affected rows from the update
          if (completedFilesResult[1] !== 0) {
            const fileIds = completedFilesResult[0].map((file) => file.id);
            const completedSyncsResult = await updateSyncAsCompletedByFiles(fileIds, schema, transactionalEntityManager);

            logger.debug({ msg: 'updated sync as completed resulted in', completedSyncsResult, changesetIds, transaction });

            completedSyncIds = completedSyncsResult[0].map((sync) => sync.id);
            await Promise.all(completedSyncIds.map(async (syncId) => updateLastRerunAsCompleted(syncId, transactionalEntityManager)));

            logger.debug({ msg: 'updated the last rerun of each completed sync', completedSyncIds, transaction });
          }
          countCompletedChangesets(changesetIds, changesetCounter);
          return completedSyncIds;
        });
      } catch (error) {
        logger.error({
          err: error,
          msg: 'failure occurred while trying to close changeset in transaction',
          changesetIds,
          transaction,
        });

        if (isTransactionFailure(error)) {
          throw new TransactionFailureError(`closing changesets has failed due to read/write dependencies among transactions.`);
        }
        changesetCounter.inc({ status: 'failed', changesetid: undefined });
        throw error;
      }
    },

    async tryClosingChangeset(changesetId: string, schema: string, changesetCounter: client.Counter<'status' | 'changesetid'>): Promise<void> {
      const isolationLevel = getIsolationLevel();
      const transaction = { transactionId: nanoid(), transactionName: TransactionName.TRY_CLOSING_CHANGESET, isolationLevel };

      logger.debug({ msg: 'attempting to close changest in multiple step transaction', changesetId, transaction });

      try {
        await this.manager.connection.transaction(isolationLevel, async (transactionalEntityManager) => {
          await updateEntitiesOfChangesetAsCompletedInTransaction(changesetId, transactionalEntityManager);

          logger.debug({ msg: 'updated entities of changeset as completed', changesetId, transaction });

          await updateFileAsCompleted([changesetId], schema, transactionalEntityManager);

          logger.debug({ msg: 'tried to update files of changeset as completed', changesetId, transaction });

          await updateSyncAsCompleted([changesetId], schema, transactionalEntityManager);

          logger.debug({ msg: 'tried to update sync affected by changeset as completed', changesetId, transaction });

          changesetCounter.inc({ status: 'closed', changesetid: changesetId });
          changesetCounter.remove({ status: 'overall', changesetid: changesetId });
        });
      } catch (error) {
        logger.error({
          err: error,
          msg: 'failure occurred while trying to close changeset in transaction',
          changesetId,
          transaction,
        });

        if (isTransactionFailure(error)) {
          throw new TransactionFailureError(`closing changeset ${changesetId} has failed due to read/write dependencies among transactions.`);
        }
        changesetCounter.inc({ status: 'failed', changesetid: undefined });
        throw error;
      }
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

let logger: Logger;

export type ChangesetRepository = ReturnType<typeof createChangesetRepository>;

export const changesetRepositoryFactory: FactoryFunction<ChangesetRepository> = (depContainer) => {
  logger = depContainer.resolve<Logger>(SERVICES.LOGGER);

  return createChangesetRepository(depContainer.resolve<DataSource>(DataSource));
};

export const CHANGESET_CUSTOM_REPOSITORY_SYMBOL = Symbol('CHANGESET_CUSTOM_REPOSITORY_SYMBOL');

function countCompletedChangesets(changesetIds: string[], changesetCounter: client.Counter<'status' | 'changesetid'>): void {
  for (let i = 0; i < changesetIds.length; i++) {
    changesetCounter.inc({ status: 'closed', changesetid: changesetIds[i] });
    changesetCounter.remove({ status: 'overall', changesetid: changesetIds[i] });
  }
}
