import { EntityManager, DataSource, In } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { nanoid } from 'nanoid';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { TransactionFailureError } from '../../changeset/models/errors';
import { isTransactionFailure, ReturningId, ReturningResult, TransactionName } from '../../common/db';
import { File, FileUpdate } from '../models/file';
import { SyncDb } from '../../sync/DAL/sync';
import { EntityStatus, Status } from '../../common/enums';
import { SERVICES } from '../../common/constants';
import { getIsolationLevel } from '../../common/utils/db';
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

    async findFilesThatCanBeClosed(): Promise<Pick<FileDb, 'fileId'>[]> {
      const fileIds: Pick<FileDb, 'fileId'>[] = await this.createQueryBuilder('file')
        .select('file.fileId', 'fileId')
        .innerJoin('file.entities', 'entity')
        .where('entity.status = :entityStatus', { entityStatus: EntityStatus.COMPLETED })
        .andWhere('file.status = :fileStatus', { fileStatus: Status.IN_PROGRESS })
        .groupBy('file.fileId')
        .addGroupBy('file.totalEntities')
        .having('COUNT(entity.entityId) = file.totalEntities')
        .getRawMany();

      return fileIds;
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

    async tryCloseFile(
      fileId: string,
      schema: string,
      transactionalEntityManager: EntityManager,
      transaction: {
        transactionId: string;
        transactionName: TransactionName;
        isolationLevel: IsolationLevel;
      }
    ): Promise<string[]> {
      logger.debug({ msg: 'attempting to close files in transaction', fileId, transaction });

      const completedFilesResult = await updateFileAsCompleted(fileId, schema, transactionalEntityManager);

      logger.debug({ msg: 'updated file as completed resulted in', completedFilesResult, fileId, transaction });
      return completedFilesResult[0].map((file) => file.id);
    },

    async tryCloseAllOpenFilesTransaction(schema: string): Promise<string[]> {
      const isolationLevel = getIsolationLevel();
      const transaction = { transactionId: nanoid(), transactionName: TransactionName.TRY_CLOSING_FILE, isolationLevel };

      let fileId = '';
      try {
        return await this.manager.connection.transaction(isolationLevel, async (transactionalEntityManager: EntityManager) => {
          let completedFiles: string[] = [];

          const inProgressFiles = await this.findFilesThatCanBeClosed();
          for (const file of inProgressFiles) {
            fileId = file.fileId;

            const completedFilesIteration = await this.tryCloseFile(fileId, schema, transactionalEntityManager, transaction);
            if (completedFilesIteration.length === 0) {
              break; // If file can't be closed, cancel all closing procedure to prevent continues lock of the DB
            }
            completedFiles = [...completedFiles, ...completedFilesIteration];
          }
          return completedFiles;
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

let logger: Logger;

export type FileRepository = ReturnType<typeof createFileRepo>;

export const fileRepositoryFactory: FactoryFunction<FileRepository> = (depContainer) => {
  logger = depContainer.resolve<Logger>(SERVICES.LOGGER);
  return createFileRepo(depContainer.resolve<DataSource>(DataSource));
};

export const FILE_CUSTOM_REPOSITORY_SYMBOL = Symbol('FILE_CUSTOM_REPOSITORY_SYMBOL');
