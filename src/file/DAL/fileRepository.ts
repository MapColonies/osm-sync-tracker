import { EntityManager, DataSource, In } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { nanoid } from 'nanoid';
import { CLOSED_PARAMS, DATA_SOURCE_PROVIDER, ReturningId, ReturningResult } from '../../common/db';
import { File, FileUpdate } from '../models/file';
import { SyncDb } from '../../sync/DAL/sync';
import { Entity as EntityDb } from '../../entity/DAL/entity';
import { EntityStatus, Status } from '../../common/enums';
import { TransactionFailureError } from '../../common/errors';
import { isTransactionFailure, TransactionFn, TransactionName, TransactionParams } from '../../common/db/transactions';
import { SERVICES } from '../../common/constants';
import { getIsolationLevel } from '../../common/utils/db';
import { ILogger } from '../../common/interfaces';
import { FILE_IDENTIFIER_COLUMN, File as FileDb, SYNC_OF_FILE_IDENTIFIER_COLUMN } from './file';

interface FileClosureIds {
  [FILE_IDENTIFIER_COLUMN]: string;
  [SYNC_OF_FILE_IDENTIFIER_COLUMN]: string;
}

async function updateFileAsCompleted(
  fileId: string,
  schema: string,
  transactionalEntityManager: EntityManager
): Promise<ReturningResult<ReturningId>> {
  return (await transactionalEntityManager.query(
    `UPDATE ${schema}.file AS FILE SET status = 'completed', end_date = LOCALTIMESTAMP
  WHERE FILE.file_id = $1 AND FILE.total_entities = (SELECT COUNT(*) AS CompletedEntities
      FROM ${schema}.entity
      WHERE file_id = $1 AND (status = 'completed' OR status = 'not_synced'))
      RETURNING FILE.file_id AS id`,
    [fileId]
  )) as ReturningResult<ReturningId>;
}

async function updateSyncAsCompleted(
  fileId: string,
  schema: string,
  transactionalEntityManager: EntityManager
): Promise<ReturningResult<ReturningId>> {
  return (await transactionalEntityManager.query(
    `UPDATE ${schema}.sync AS sync_to_update SET status = 'completed', end_date = LOCALTIMESTAMP
  FROM (
    SELECT DISTINCT sync_id
    FROM ${schema}.file
    WHERE file_id = $1 AND status = 'completed') AS sync_from_file
  WHERE sync_to_update.id = sync_from_file.sync_id AND sync_to_update.total_files = (SELECT COUNT(*) FROM ${schema}.file WHERE sync_id = sync_to_update.id AND status = 'completed')
  RETURNING sync_to_update.id`,
    [fileId]
  )) as ReturningResult<ReturningId>;
}

async function updateLastRerunAsCompleted(syncId: string, transactionalEntityManager: EntityManager): Promise<void> {
  const completedSyncWithLastRerun = await transactionalEntityManager
    .createQueryBuilder(SyncDb, 'sync')
    .leftJoinAndSelect('sync.reruns', 'rerun')
    .where('sync.id = :syncId', { syncId })
    .orderBy('rerun.run_number', 'DESC')
    .limit(1)
    .getOne();

  if (completedSyncWithLastRerun && completedSyncWithLastRerun.reruns.length > 0) {
    const lastRerun = completedSyncWithLastRerun.reruns[0];
    await transactionalEntityManager.update(SyncDb, { id: lastRerun.id }, { status: Status.COMPLETED, endDate: completedSyncWithLastRerun.endDate });
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createFileRepo = (dataSource: DataSource) => {
  return dataSource.getRepository(FileDb).extend({
    async transactionify<T>(params: TransactionParams, fn: TransactionFn<T>): Promise<T> {
      logger.info({ msg: 'attempting to run transaction', ...params });

      try {
        const result = await this.manager.connection.transaction(params.isolationLevel, fn);

        logger.info({ msg: 'transaction completed successfully', ...params });

        return result;
      } catch (error) {
        logger.error({ msg: 'failure occurred while running transaction', ...params, err: error });

        if (isTransactionFailure(error)) {
          throw new TransactionFailureError(`running transaction has failed due to read/write dependencies among transactions.`);
        }

        throw error;
      }
    },

    async createFile(file: File): Promise<void> {
      await this.insert(file);
    },

    async updateFile(fileId: string, updatedFile: FileUpdate): Promise<void> {
      await this.update(fileId, updatedFile);
    },

    async createFiles(files: File[]): Promise<void> {
      await this.insert(files);
    },

    async findOneFile(fileId: string): Promise<FileDb | null> {
      return this.findOne({ where: { fileId } });
    },

    async findManyFilesByIds(files: File[]): Promise<FileDb[] | null> {
      const filesEntities = await this.findBy({ fileId: In(files.map((f) => f.fileId)) });
      if (filesEntities.length === 0) {
        return null;
      }
      return filesEntities;
    },

    /**
     * Attempting to close a file by its id.
     * file is up for closure if it matches the following parameters:
     * 1. Its id is the given fileId
     * 2. Its status is not already completed
     * 3. Its totalEntities amount matches the number of entities in the
     * file that are are already closed, meaning have completed or not synced status
     *
     * Once closed the file will be updated to have completed status and an endDate.
     *
     * @param fileId - The file id
     * @param transactionManager - Optional typeorm transacation manager
     * @returns The affected fileId, syncId pair
     */
    async attemptFileClosure(fileId: string, transactionManager?: EntityManager): Promise<ReturningResult<FileClosureIds>> {
      const scopedManager = transactionManager ?? this.manager;

      const result = await scopedManager
        .createQueryBuilder(FileDb, 'file')
        .update(FileDb)
        .set(CLOSED_PARAMS)
        .andWhere((qb) => {
          // a workaround due to UpdateQueryBuilder not supporting subQuery function
          const subQuery = scopedManager
            .createQueryBuilder(EntityDb, 'entity')
            .select('COUNT(*)')
            .where('entity.file_id = :fileId', { fileId })
            .andWhere('entity.status = ANY(:statuses)', { statuses: [EntityStatus.COMPLETED, EntityStatus.NOT_SYNCED] });
          qb.setParameters(subQuery.getParameters());

          return qb
            .whereEntity({ fileId } as FileDb)
            .andWhere('file.status != :completed', { completed: Status.COMPLETED })
            .andWhere(`file.total_entities = (${subQuery.getQuery()})`);
        })
        .returning([FILE_IDENTIFIER_COLUMN, SYNC_OF_FILE_IDENTIFIER_COLUMN])
        .execute();

      return [result.generatedMaps as FileClosureIds[], result.affected ?? 0];
    },

    async tryClosingFile(fileId: string, schema: string): Promise<string[]> {
      const isolationLevel = getIsolationLevel();
      const transaction = { transactionId: nanoid(), transactionName: TransactionName.TRY_CLOSING_FILE, isolationLevel };

      logger.debug({ msg: 'attempting to close file and in turn its syncs in multiple step transaction', fileId, transaction });

      try {
        return await this.manager.connection.transaction(isolationLevel, async (transactionalEntityManager) => {
          let completedSyncIds: string[] = [];
          const completedFilesResult = await updateFileAsCompleted(fileId, schema, transactionalEntityManager);

          logger.debug({ msg: 'updated file as completed resulted in', completedFilesResult, fileId, transaction });

          // check if there are any affected rows from the update
          if (completedFilesResult[1] !== 0) {
            const completedSyncsResult = await updateSyncAsCompleted(fileId, schema, transactionalEntityManager);

            logger.debug({ msg: 'updated sync as completed resulted in', completedSyncsResult, fileId, transaction });

            completedSyncIds = completedSyncsResult[0].map((sync) => sync.id);
            await Promise.all(completedSyncIds.map(async (syncId) => updateLastRerunAsCompleted(syncId, transactionalEntityManager)));

            logger.debug({ msg: 'updated the last rerun of each completed sync', completedSyncIds, fileId, transaction });
          }

          return completedSyncIds;
        });
      } catch (error) {
        logger.error({ err: error, msg: 'failure occurred while trying to close file in transaction', fileId, transaction });

        if (isTransactionFailure(error)) {
          throw new TransactionFailureError(`closing file ${fileId} has failed due to read/write dependencies among transactions.`);
        }
        throw error;
      }
    },
  });
};

let logger: ILogger;

export interface FileId {
  [FILE_IDENTIFIER_COLUMN]: string;
}

export type FileRepository = ReturnType<typeof createFileRepo>;

export const fileRepositoryFactory: FactoryFunction<FileRepository> = (depContainer) => {
  const baseLogger = depContainer.resolve<Logger>(SERVICES.LOGGER);
  logger = baseLogger.child({ component: 'fileRepository' });

  return createFileRepo(depContainer.resolve<DataSource>(DATA_SOURCE_PROVIDER));
};

export const FILE_CUSTOM_REPOSITORY_SYMBOL = Symbol('FILE_CUSTOM_REPOSITORY_SYMBOL');
