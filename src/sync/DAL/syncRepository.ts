import { Brackets, DataSource, EntityManager, FindOptionsWhere, In, MoreThan } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { nanoid } from 'nanoid';
import { EntityStatus, GeometryType, Status } from '../../common/enums';
import { isTransactionFailure, TransactionName } from '../../common/db/transactions';
import { CreateRerunRequest, Sync, SyncsFilter, SyncUpdate, SyncWithReruns } from '../models/sync';
import { CLOSED_PARAMS, DATA_SOURCE_PROVIDER, ReturningId, ReturningResult } from '../../common/db';
import { TransactionFailureError } from '../../common/errors';
import { SERVICES } from '../../common/constants';
import { File as FileDb } from '../../file/DAL/file';
import { ILogger } from '../../common/interfaces';
import { SYNC_IDENTIFIER_COLUMN, SyncDb } from './sync';

interface SyncId {
  [SYNC_IDENTIFIER_COLUMN]: string;
}

// deletes a file who has no entities registered to it
async function deleteEmptyFiles(
  baseSyncId: string,
  schema: string,
  transactionalEntityManager: EntityManager
): Promise<ReturningResult<ReturningId>> {
  return (await transactionalEntityManager.query(
    `
  DELETE FROM ${schema}.file
  WHERE file_id IN (
    SELECT file_id
      FROM ${schema}.file
      WHERE sync_id = $1
    EXCEPT
    SELECT DISTINCT f.file_id
      FROM ${schema}.entity AS e
      JOIN ${schema}.file f ON e.file_id = f.file_id
      WHERE f.sync_id = $1)
  RETURNING file_id AS id
  `,
    [baseSyncId]
  )) as ReturningResult<ReturningId>;
}

// try closing the sync if it has total files value as actual completed files
async function tryClosingSync(baseSyncId: string, schema: string, transactionalEntityManager: EntityManager): Promise<ReturningResult<ReturningId>> {
  return (await transactionalEntityManager.query(
    `
    UPDATE ${schema}.sync AS sync_to_update
      SET status = 'completed', end_date = LOCALTIMESTAMP
      WHERE sync_to_update.id = $1
      AND sync_to_update.total_files = (
        SELECT COUNT(*) FROM osm_sync_tracker.file
          WHERE sync_id = sync_to_update.id
          AND status = 'completed')
    RETURNING sync_to_update.id
  `,
    [baseSyncId]
  )) as ReturningResult<ReturningId>;
}

// copies the entities who were affected on the current sync run into entity_history table
async function createEntityHistory(
  baseSyncId: string,
  syncId: string,
  entityHistoryBaseSyncId: string | null,
  schema: string,
  transactionalEntityManager: EntityManager
): Promise<void> {
  await transactionalEntityManager.query(
    `
  WITH entities_for_history AS (
    SELECT entity_id, e.file_id, changeset_id, e.status, action, fail_reason
      FROM ${schema}.entity AS e
      JOIN ${schema}.file f ON e.file_id = f.file_id
      WHERE f.sync_id = $1
      AND e.status != 'inrerun'
    EXCEPT
    SELECT e.entity_id, e.file_id, e.changeset_id, e.status, e.action, e.fail_reason
      FROM ${schema}.entity AS e
      LEFT JOIN ${schema}.entity_history h ON e.entity_id = h.entity_id
      WHERE
      h.sync_id IN (
        SELECT id
        FROM ${schema}.sync
        WHERE base_sync_id = $1
        UNION
        SELECT $1
      )
      AND h.status = 'completed'
  )

  INSERT INTO ${schema}.entity_history (entity_id, file_id, base_sync_id, sync_id, changeset_id, status, action, fail_reason)
  SELECT entity_id, file_id, $3, $2, changeset_id, status, action, fail_reason
  FROM entities_for_history
  `,
    [baseSyncId, syncId, entityHistoryBaseSyncId]
  );
}

// updates file's status as inprogress if it holds a not synced entity
async function prepareIncompleteFiles(baseSyncId: string, schema: string, transactionalEntityManager: EntityManager): Promise<void> {
  await transactionalEntityManager.query(
    `
  UPDATE ${schema}.file AS file_for_inprogress
  SET status = 'inprogress'
  WHERE file_for_inprogress.file_id IN (
  SELECT DISTINCT f.file_id
    FROM ${schema}.entity AS e
    JOIN ${schema}.file f ON e.file_id = f.file_id
    WHERE f.sync_id = $1
    AND e.status = 'not_synced'
  )
  `,
    [baseSyncId]
  );
}

// updates entity's status as inrerun and resets it's changeset id and fail reason if its status is not completed or inrerun already
async function prepareIncompleteEntities(
  baseSyncId: string,
  entityStatusesForRerun: EntityStatus[],
  schema: string,
  transactionalEntityManager: EntityManager
): Promise<void> {
  await transactionalEntityManager.query(
    `
  UPDATE ${schema}.entity AS entity_for_rerun
  SET status = 'inrerun', changeset_id = NULL, fail_reason = NULL, action = NULL
  FROM ${schema}.entity AS e
    JOIN ${schema}.file f ON e.file_id = f.file_id
    WHERE f.sync_id = $1
    AND e.file_id = entity_for_rerun.file_id
    AND e.entity_id = entity_for_rerun.entity_id
    AND e.status = ANY($2)
  `,
    [baseSyncId, entityStatusesForRerun]
  );
}

async function updateDanglingFilesAsCompleted(syncId: string, schema: string, transactionalEntityManager: EntityManager): Promise<void> {
  await transactionalEntityManager.query(
    `WITH dangling_files AS (
      SELECT file_id
      FROM ${schema}.file
      WHERE sync_id = $1 AND status = 'inprogress')

    UPDATE ${schema}.file AS FILE SET status = 'completed', end_date = LOCALTIMESTAMP
    FROM (
      SELECT file_id, COUNT(*) AS CompletedEntities
      FROM ${schema}.entity
      WHERE file_id IN (SELECT * FROM dangling_files) AND (status = 'completed' or status = 'not_synced')
      GROUP BY file_id) AS FILES_TO_UPDATE
    WHERE FILE.file_id = FILES_TO_UPDATE.file_id AND FILES_TO_UPDATE.CompletedEntities = FILE.total_entities AND FILE.status != 'completed'
    `,
    [syncId]
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createSyncRepo = (dataSource: DataSource) => {
  return dataSource.getRepository(SyncDb).extend({
    async getLatestSync(layerId: number, geometryType: GeometryType): Promise<SyncDb | null> {
      return this.createQueryBuilder('sync')
        .select('sync')
        .where(
          `layer_id = :layerId and geometry_type = :geometryType and run_number = 0 and (not(metadata @> '{"isFixDiff": "true"}') or metadata is null or status = 'failed')`,
          { layerId, geometryType }
        )
        .orderBy('dump_date', 'DESC')
        .addOrderBy('start_date', 'DESC')
        .limit(1)
        .getOne();
    },

    async createSync(sync: Sync): Promise<void> {
      await this.insert(sync);
    },

    async updateSync(syncId: string, sync: SyncUpdate): Promise<void> {
      await this.update(syncId, sync);
    },

    async findOneSync(syncId: string): Promise<Sync | null> {
      return this.findOne({ where: { id: syncId } });
    },

    async findSyncs(filter: Partial<Sync>): Promise<Sync[]> {
      return this.find({ where: filter as FindOptionsWhere<Sync> });
    },

    async filterSyncs(filter: SyncsFilter): Promise<Sync[]> {
      const { status, layerId, geometryType, isFull, isRerun } = filter;
      const options: FindOptionsWhere<Sync> = {};
      if (status) {
        options.status = In(status);
      }

      if (layerId) {
        options.layerId = In(layerId);
      }

      if (geometryType) {
        options.geometryType = In(geometryType);
      }

      if (isFull !== undefined) {
        options.isFull = isFull;
      }

      if (isRerun !== undefined) {
        options.runNumber = isRerun ? MoreThan(0) : 0;
      }

      return this.find({ where: options });
    },

    async findOneSyncWithLastRerun(syncId: string): Promise<SyncWithReruns | null> {
      return this.createQueryBuilder('sync')
        .leftJoinAndSelect('sync.reruns', 'rerun')
        .where('sync.id = :syncId', { syncId })
        .orderBy('rerun.run_number', 'DESC')
        .limit(1)
        .getOne();
    },

    /**
     * Attempting to close a sync and its reruns by its id.
     *
     * sync is up for closure if it matches the following parameters:
     * 1. Its id is the given syncId
     * 2. Its status is not already completed
     * 3. Its totalFiles amount matches the number of files in the
     * sync that are are already closed, meaning have completed status
     *
     * A sync might have multiple reruns or none,
     * rerun is up for closure if it matches the following parameters:
     * 1. Its base_sync_id is the given syncId
     * 2. Its status is inprogress
     * 3. Its totalFiles amount matches the number of files in the
     * base sync that are are already closed, meaning have completed status
     *
     * Once closed the sync (and reruns) will be updated to have completed status and an endDate.
     *
     * @param syncId - The sync id
     * @param transactionManager - Optional typeorm transacation manager
     * @returns The affected syncId or the sync and possibly reruns
     */
    async attemptSyncClosure(syncId: string): Promise<ReturningResult<SyncId>> {
      const result = await this.manager
        .createQueryBuilder(SyncDb, 'sync')
        .update(SyncDb)
        .set(CLOSED_PARAMS)
        .andWhere((qb) => {
          // a workaround due to UpdateQueryBuilder not supporting subQuery function
          const subQuery = this.manager
            .createQueryBuilder(FileDb, 'file')
            .select('COUNT(*)')
            .where('file.sync_id = :syncId', { syncId })
            .andWhere('file.status = :fileStatus', { fileStatus: Status.COMPLETED });

          qb.setParameters(subQuery.getParameters());

          return qb
            .where(
              new Brackets((qb) => {
                qb.where('sync.id = :syncId', { syncId })
                  .andWhere('sync.status != :syncStatus', { syncStatus: Status.COMPLETED })
                  .orWhere('sync.base_sync_id = :syncId', { syncId })
                  .andWhere('sync.status = :inprogress', { inprogress: Status.IN_PROGRESS });
              })
            )
            .andWhere(`sync.total_files = (${subQuery.getQuery()})`);
        })
        .returning([SYNC_IDENTIFIER_COLUMN])
        .execute();

      return [result.raw as SyncId[], result.affected ?? 0];
    },

    async createRerun(rerunRequest: CreateRerunRequest, schema: string): Promise<boolean> {
      const isolationLevel = 'SERIALIZABLE';
      const transaction = { transactionId: nanoid(), transactionName: TransactionName.CREATE_RERUN, isolationLevel };

      const { shouldRerunNotSynced, ...rerunSync } = rerunRequest;
      const { id: rerunId, baseSyncId } = rerunSync;

      logger.debug({ msg: 'attempting to create rerun in multiple step transaction', rerunId, baseSyncId, shouldRerunNotSynced, transaction });

      try {
        return await this.manager.connection.transaction(isolationLevel, async (transactionalEntityManager: EntityManager) => {
          const deletedFilesResult = await deleteEmptyFiles(baseSyncId as string, schema, transactionalEntityManager);

          logger.debug({
            msg: 'deleted empty files on base sync resulted in',
            deletedFilesResult,
            rerunId,
            baseSyncId,
            transaction,
          });

          // try closing the sync only if files were deleted
          if (deletedFilesResult[1] !== 0) {
            const closedSync = await tryClosingSync(baseSyncId as string, schema, transactionalEntityManager);

            logger.debug({
              msg: 'trying to close base sync resulted in',
              rerunId,
              baseSyncId,
              closeSyncResult: closedSync,
              transaction,
            });

            // if the sync was closed just return false
            if (closedSync[1] !== 0) {
              logger.debug({
                msg: 'attempting to create rerun resulted in closing sync, no need to create rerun',
                rerunId,
                baseSyncId,
                transaction,
              });
              return false;
            }
          }

          let latestRerunOrSyncId = baseSyncId as string;
          const latestSyncWithReruns = await this.findOneSyncWithLastRerun(baseSyncId as string);
          if (latestSyncWithReruns && latestSyncWithReruns.reruns.length > 0) {
            latestRerunOrSyncId = latestSyncWithReruns.reruns[0].id;
          }

          logger.debug({
            msg: 'getting latest sync with rerun resulted in',
            rerunId,
            baseSyncId,
            latestRerunOrSyncId,
            transaction,
          });

          await createEntityHistory(
            baseSyncId as string,
            latestRerunOrSyncId,
            latestRerunOrSyncId === baseSyncId ? null : baseSyncId,
            schema,
            transactionalEntityManager
          );

          logger.debug({ msg: 'created entity history', rerunId, baseSyncId, transaction });

          if (shouldRerunNotSynced) {
            await prepareIncompleteFiles(baseSyncId as string, schema, transactionalEntityManager);
            logger.debug({ msg: 'prepared incomplete files', rerunId, baseSyncId, transaction });
          } else {
            await updateDanglingFilesAsCompleted(baseSyncId as string, schema, transactionalEntityManager);
            logger.debug({ msg: 'updated dangling files as completed', rerunId, baseSyncId, transaction });
          }

          const entityStatusesForRerun = shouldRerunNotSynced
            ? [EntityStatus.IN_PROGRESS, EntityStatus.NOT_SYNCED, EntityStatus.FAILED]
            : [EntityStatus.IN_PROGRESS, EntityStatus.FAILED];
          await prepareIncompleteEntities(baseSyncId as string, entityStatusesForRerun, schema, transactionalEntityManager);

          logger.debug({ msg: 'prepared incomplete entities', rerunId, baseSyncId, entityStatusesForRerun, transaction });

          await this.createSync(rerunSync);

          logger.debug({ msg: 'created rerun sync', rerunId, baseSyncId, entityStatusesForRerun, transaction });

          return true;
        });
      } catch (error) {
        logger.error({
          err: error,
          msg: 'failure occurred while trying to create rerun in transaction',
          rerunId,
          baseSyncId,
          transaction,
        });

        if (isTransactionFailure(error)) {
          throw new TransactionFailureError(`rerun creation has failed due to read/write dependencies among transactions.`);
        }
        throw error;
      }
    },
  });
};

let logger: ILogger;

export type SyncRepository = ReturnType<typeof createSyncRepo>;

export const syncRepositoryFactory: FactoryFunction<SyncRepository> = (depContainer) => {
  const baseLogger = depContainer.resolve<Logger>(SERVICES.LOGGER);
  logger = baseLogger.child({ component: 'syncRepository' });

  return createSyncRepo(depContainer.resolve<DataSource>(DATA_SOURCE_PROVIDER));
};

export const SYNC_CUSTOM_REPOSITORY_SYMBOL = Symbol('SYNC_CUSTOM_REPOSITORY_SYMBOL');
