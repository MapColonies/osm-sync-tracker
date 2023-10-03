import { EntityManager, DataSource, In } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { nanoid } from 'nanoid';
import { TransactionFailureError } from '../../changeset/models/errors';
import { isTransactionFailure, ReturningId, ReturningResult, TransactionName } from '../../common/db';
import { File, FileUpdate } from '../models/file';
import { SyncDb } from '../../sync/DAL/sync';
import { Status } from '../../common/enums';
import { SERVICES } from '../../common/constants';
import { getIsolationLevel } from '../../common/utils/db';
import { fileCounter, syncCounter } from '../../common/metrics';
import { File as FileDb } from './file';

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
            const fileIds = completedFilesResult[0].map((file) => file.id);
            countCompletedFiles(fileIds);

            const completedSyncsResult = await updateSyncAsCompleted(fileId, schema, transactionalEntityManager);

            logger.debug({ msg: 'updated sync as completed resulted in', completedSyncsResult, fileId, transaction });

            completedSyncIds = completedSyncsResult[0].map((sync) => sync.id);
            await Promise.all(completedSyncIds.map(async (syncId) => updateLastRerunAsCompleted(syncId, transactionalEntityManager)));

            logger.debug({ msg: 'updated the last rerun of each completed sync', completedSyncIds, fileId, transaction });
          }
          countCompletedSyncs(completedSyncIds);
          return completedSyncIds;
        });
      } catch (error) {
        logger.error({ err: error, msg: 'failure occurred while trying to close file in transaction', fileId, transaction });

        if (isTransactionFailure(error)) {
          throw new TransactionFailureError(`closing file ${fileId} has failed due to read/write dependencies among transactions.`);
        }
        fileCounter.inc({ status: 'failed', fileid: fileId });
        throw error;
      }
    },
  });
};

function countCompletedFiles(fileIds: string[]): void {
  for (let i = 0; i < fileIds.length; i++) {
    fileCounter.inc({ status: 'closed', fileid: fileIds[i] });
    fileCounter.remove({ status: 'overall', fileid: fileIds[i] });
  }
}

function countCompletedSyncs(syncIds: string[]): void {
  for (let i = 0; i < syncIds.length; i++) {
    syncCounter.inc({ status: 'closed', syncid: syncIds[i] });
    syncCounter.remove({ status: 'overall', syncid: syncIds[i] });
  }
}

let logger: Logger;

export type FileRepository = ReturnType<typeof createFileRepo>;

export const fileRepositoryFactory: FactoryFunction<FileRepository> = (depContainer) => {
  logger = depContainer.resolve<Logger>(SERVICES.LOGGER);
  return createFileRepo(depContainer.resolve<DataSource>(DataSource));
};

export const FILE_CUSTOM_REPOSITORY_SYMBOL = Symbol('FILE_CUSTOM_REPOSITORY_SYMBOL');
