import { EntityRepository, Repository } from 'typeorm';
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

  public async tryClosingFile(fileId: string, schema: string): Promise<void> {
    await this.manager.connection.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.query(
        `UPDATE ${schema}.file as FILE set status = 'completed', end_date = current_timestamp
        WHERE FILE.file_id = $1 and FILE.total_entities = (SELECT COUNT(*) as CompletedEntities
            FROM ${schema}.entity
            WHERE file_id = $1 and (status = 'completed' or status = 'not_synced'))`,
        [fileId]
      );

      await transactionalEntityManager.query(
        `UPDATE ${schema}.sync as sync_to_update set status = 'completed', end_date = current_timestamp
        FROM (
          SELECT distinct sync_id
          FROM ${schema}.file
          WHERE file_id = $1 and status = 'completed') as sync_from_file
        WHERE sync_to_update.id = sync_from_file.sync_id and sync_to_update.total_files = (SELECT count (*) from ${schema}.file where sync_id = sync_to_update.id and status = 'completed')`,
        [fileId]
      );
    });
  }
}
