import { EntityManager, EntityRepository, Repository } from 'typeorm';
import { inject } from 'tsyringe';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { TransactionFailureError } from '../../../changeset/models/errors';
import { SERVICES } from '../../../common/constants';
import { isTransactionFailure, UpdateResult } from '../../../common/db';
import { IApplication } from '../../../common/interfaces';
import { File } from '../../models/file';
import { IFileRepository } from '../fileRepository';
import { SyncDb } from '../../../sync/DAL/typeorm/sync';
import { Status } from '../../../common/enums';
import { File as FileDb } from './file';

interface UpdatedId {
  id: string;
}

@EntityRepository(FileDb)
export class FileRepository extends Repository<FileDb> implements IFileRepository {
  private readonly transationIsolationLevel: IsolationLevel;

  public constructor(@inject(SERVICES.APPLICATION) private readonly appConfig: IApplication) {
    super();
    this.transationIsolationLevel = this.appConfig.isolationLevel;
  }

  public async createFile(file: File): Promise<void> {
    await this.insert(file);
  }

  public async createFiles(files: File[]): Promise<void> {
    await this.insert(files);
  }

  public async findOneFile(fileId: string): Promise<FileDb | undefined> {
    return this.findOne(fileId);
  }

  public async findManyFiles(files: File[]): Promise<FileDb[] | undefined> {
    const filesEntities = await this.findByIds(files);
    if (filesEntities.length === 0) {
      return undefined;
    }
    return filesEntities;
  }

  public async tryClosingFile(fileId: string, schema: string): Promise<string[]> {
    try {
      return await this.manager.connection.transaction(this.transationIsolationLevel, async (transactionalEntityManager) => {
        let completedSyncIds: string[] = [];
        const completedFilesResult = await this.updateFileAsCompleted(fileId, schema, transactionalEntityManager);
        // check if are there affected rows from the update
        if (completedFilesResult[1] !== 0) {
          const completedSyncsResult = await this.updateSyncAsCompleted(fileId, schema, transactionalEntityManager);
          completedSyncIds = completedSyncsResult[0].map((sync) => sync.id);
          await Promise.all(completedSyncIds.map(async (syncId) => this.updateLastRerunAsCompleted(syncId, transactionalEntityManager)));
        }
        return completedSyncIds;
      });
    } catch (error) {
      if (isTransactionFailure(error)) {
        throw new TransactionFailureError(`closing file ${fileId} has failed due to read/write dependencies among transactions.`);
      }
      throw error;
    }
  }

  private async updateFileAsCompleted(fileId: string, schema: string, transactionalEntityManager: EntityManager): Promise<UpdateResult<UpdatedId>> {
    return (await transactionalEntityManager.query(
      `UPDATE ${schema}.file AS FILE SET status = 'completed', end_date = current_timestamp
    WHERE FILE.file_id = $1 AND FILE.total_entities = (SELECT COUNT(*) AS CompletedEntities
        FROM ${schema}.entity
        WHERE file_id = $1 AND (status = 'completed' OR status = 'not_synced'))
        RETURNING FILE.file_id AS id`,
      [fileId]
    )) as UpdateResult<UpdatedId>;
  }

  private async updateSyncAsCompleted(fileId: string, schema: string, transactionalEntityManager: EntityManager): Promise<UpdateResult<UpdatedId>> {
    return (await transactionalEntityManager.query(
      `UPDATE ${schema}.sync AS sync_to_update SET status = 'completed', end_date = current_timestamp
    FROM (
      SELECT DISTINCT sync_id
      FROM ${schema}.file
      WHERE file_id = $1 AND status = 'completed') AS sync_from_file
    WHERE sync_to_update.id = sync_from_file.sync_id AND sync_to_update.total_files = (SELECT COUNT(*) FROM ${schema}.file WHERE sync_id = sync_to_update.id AND status = 'completed')
    RETURNING sync_to_update.id`,
      [fileId]
    )) as UpdateResult<UpdatedId>;
  }

  private async updateLastRerunAsCompleted(syncId: string, transactionalEntityManager: EntityManager): Promise<void> {
    const completedSync = await transactionalEntityManager.findOne(SyncDb, { relations: ['reruns'], where: { id: syncId } });

    if (completedSync && completedSync.reruns.length > 0) {
      const lastRerun = completedSync.reruns.sort((rerunA, rerunB) => rerunA.number - rerunB.number)[completedSync.reruns.length - 1];
      await transactionalEntityManager.update(SyncDb, { id: lastRerun.rerunId }, { status: Status.COMPLETED, endDate: completedSync.endDate });
    }
  }
}
