import { EntityManager, EntityRepository, Repository } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { TransactionFailureError } from '../../../changeset/models/errors';
import { isTransactionFailure } from '../../../common/db';
import { File } from '../../models/file';
import { IFileRepository } from '../fileRepository';
import { File as FileDb } from './file';

@EntityRepository(FileDb)
export class FileRepository extends Repository<FileDb> implements IFileRepository {
  public async createFile(file: File): Promise<void> {
    await this.insert(file);
  }

  public async createFiles(files: File[]): Promise<void> {
    await this.insert(files);
  }

  public async findOneFile(fileId: string): Promise<FileDb | undefined> {
    const fileEntity = await this.findOne(fileId);
    if (fileEntity == undefined) {
      return undefined;
    }
    return fileEntity;
  }

  public async findManyFiles(files: File[]): Promise<FileDb[] | undefined> {
    const filesEntities = await this.findByIds(files);
    if (filesEntities.length === 0) {
      return undefined;
    }
    return filesEntities;
  }

  public async tryClosingFile(fileId: string, schema: string, isolationLevel: IsolationLevel): Promise<void> {
    try {
      await this.manager.connection.transaction(isolationLevel, async (transactionalEntityManager) => {
        await this.updateFileAsCompleted(fileId, schema, transactionalEntityManager);

        await this.updateSyncAsCompleted(fileId, schema, transactionalEntityManager);
      });
    } catch (error) {
      if (isTransactionFailure(error)) {
        throw new TransactionFailureError(`closing file ${fileId} has failed due to read/write dependencies among transactions.`);
      }
      throw error;
    }
  }

  private async updateFileAsCompleted(fileId: string, schema: string, transactionalEntityManager: EntityManager): Promise<void> {
    await transactionalEntityManager.query(
      `UPDATE ${schema}.file AS FILE SET status = 'completed', end_date = current_timestamp
    WHERE FILE.file_id = $1 AND FILE.total_entities = (SELECT COUNT(*) AS CompletedEntities
        FROM ${schema}.entity
        WHERE file_id = $1 AND (status = 'completed' OR status = 'not_synced'))`,
      [fileId]
    );
  }

  private async updateSyncAsCompleted(fileId: string, schema: string, transactionalEntityManager: EntityManager): Promise<void> {
    await transactionalEntityManager.query(
      `UPDATE ${schema}.sync AS sync_to_update SET status = 'completed', end_date = current_timestamp
    FROM (
      SELECT DISTINCT sync_id
      FROM ${schema}.file
      WHERE file_id = $1 AND status = 'completed') AS sync_from_file
    WHERE sync_to_update.id = sync_from_file.sync_id AND sync_to_update.total_files = (SELECT COUNT(*) FROM ${schema}.file WHERE sync_id = sync_to_update.id AND status = 'completed')`,
      [fileId]
    );
  }
}
