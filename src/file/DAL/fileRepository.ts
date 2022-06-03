import { EntityManager, DataSource, In } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { TransactionFailureError } from '../../changeset/models/errors';
import { isTransactionFailure, ReturningId, ReturningResult } from '../../common/db';
import { File } from '../models/file';
import { SyncDb } from '../../sync/DAL/sync';
import { Status } from '../../common/enums';
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

    async findManyFiles(files: File[]): Promise<FileDb[] | null> {
      const filesEntities = await this.findBy({ fileId: In(files.map((e) => e.fileId)) });
      if (filesEntities.length === 0) {
        return null;
      }
      return filesEntities;
    },

    async tryClosingFile(fileId: string, schema: string): Promise<string[]> {
      try {
        return await this.manager.connection.transaction(getIsolationLevel(), async (transactionalEntityManager) => {
          let completedSyncIds: string[] = [];
          const completedFilesResult = await updateFileAsCompleted(fileId, schema, transactionalEntityManager);
          // check if are there affected rows from the update
          if (completedFilesResult[1] !== 0) {
            const completedSyncsResult = await updateSyncAsCompleted(fileId, schema, transactionalEntityManager);
            completedSyncIds = completedSyncsResult[0].map((sync) => sync.id);
            await Promise.all(completedSyncIds.map(async (syncId) => updateLastRerunAsCompleted(syncId, transactionalEntityManager)));
          }
          return completedSyncIds;
        });
      } catch (error) {
        if (isTransactionFailure(error)) {
          throw new TransactionFailureError(`closing file ${fileId} has failed due to read/write dependencies among transactions.`);
        }
        throw error;
      }
    },
  });
};

export type FileRepository = ReturnType<typeof createFileRepo>;

export const fileRepositoryFactory: FactoryFunction<FileRepository> = (depContainer) => {
  return createFileRepo(depContainer.resolve<DataSource>(DataSource));
};

export const FILE_CUSTOM_REPOSITORY_SYMBOL = Symbol('FILE_CUSTOM_REPOSITORY_SYMBOL');
