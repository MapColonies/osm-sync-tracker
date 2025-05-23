import { DataSource, In } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { CLOSED_PARAMS, DATA_SOURCE_PROVIDER, ReturningResult } from '../../common/db';
import { File, FileUpdate } from '../models/file';
import { Entity as EntityDb } from '../../entity/DAL/entity';
import { EntityStatus, Status } from '../../common/enums';
import { FILE_IDENTIFIER_COLUMN, File as FileDb, SYNC_OF_FILE_IDENTIFIER_COLUMN } from './file';

interface FileClosureIds {
  [FILE_IDENTIFIER_COLUMN]: string;
  [SYNC_OF_FILE_IDENTIFIER_COLUMN]: string;
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
    async attemptFileClosure(fileId: string): Promise<ReturningResult<FileClosureIds>> {
      const result = await this.manager
        .createQueryBuilder(FileDb, 'file')
        .update(FileDb)
        .set(CLOSED_PARAMS)
        .andWhere((qb) => {
          // a workaround due to UpdateQueryBuilder not supporting subQuery function
          const subQuery = this.manager
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
  });
};

export interface FileId {
  [FILE_IDENTIFIER_COLUMN]: string;
}

export type FileRepository = ReturnType<typeof createFileRepo>;

export const fileRepositoryFactory: FactoryFunction<FileRepository> = (depContainer) => {
  return createFileRepo(depContainer.resolve<DataSource>(DATA_SOURCE_PROVIDER));
};

export const FILE_CUSTOM_REPOSITORY_SYMBOL = Symbol('FILE_CUSTOM_REPOSITORY_SYMBOL');
