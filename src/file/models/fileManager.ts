import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import lodash from 'lodash';
import { SERVICES } from '../../common/constants';
import { ISyncRepository, syncRepositorySymbol } from '../../sync/DAL/syncRepository';
import { SyncNotFoundError } from '../../sync/models/errors';
import { IFileRepository, fileRepositorySymbol } from '../DAL/fileRepository';
import { Sync } from '../../sync/models/sync';
import { ConflictingRerunFileError, DuplicateFilesError, FileAlreadyExistsError } from './errors';
import { File } from './file';

@injectable()
export class FileManager {
  public constructor(
    @inject(fileRepositorySymbol) private readonly fileRepository: IFileRepository,
    @inject(syncRepositorySymbol) private readonly syncRepository: ISyncRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}

  public async createFile(syncId: string, file: File): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(syncId);

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    if (syncEntity.baseSyncId != null) {
      return this.createRerunFile(syncEntity, file);
    }

    const fileEntity = await this.fileRepository.findOneFile(file.fileId);

    if (fileEntity) {
      throw new FileAlreadyExistsError(`file = ${file.fileId} already exists`);
    }

    await this.fileRepository.createFile({ ...file, syncId });
  }

  public async createFiles(syncId: string, files: File[]): Promise<void> {
    const filesWithSyncId = files.map((file) => ({ ...file, syncId }));
    const syncEntity = await this.syncRepository.findOneSync(syncId);
    const dup = lodash.uniqBy(files, 'fileId');

    if (dup.length !== files.length) {
      throw new DuplicateFilesError(`files = [${dup.map((file) => file.fileId).toString()}] are duplicate`);
    }

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    const filesEntities = await this.fileRepository.findManyFiles(filesWithSyncId);

    if (filesEntities) {
      throw new FileAlreadyExistsError(`files = [${filesEntities.map((file) => file.fileId).toString()}] already exists`);
    }

    await this.fileRepository.createFiles(filesWithSyncId);
  }

  private async createRerunFile(rerunSync: Sync, rerunFile: File): Promise<void> {
    const fileEntity = await this.fileRepository.findOneFile(rerunFile.fileId);

    if (!fileEntity) {
      return this.fileRepository.createFile({ ...rerunFile, syncId: rerunSync.baseSyncId as string });
    }

    if (rerunSync.baseSyncId != fileEntity.syncId) {
      this.logger.error(
        `conflicting file creation on rerun sync = ${rerunSync.id}, existing file = ${fileEntity.fileId} with syncId ${
          fileEntity.syncId
        } while rerun has base syncId ${rerunSync.baseSyncId as string}`
      );
      throw new ConflictingRerunFileError(`rerun file = ${rerunFile.fileId} conflicting sync id`);
    }

    if (rerunFile.totalEntities != fileEntity.totalEntities) {
      const rerunFileTotalEntities = rerunFile.totalEntities != null ? rerunFile.totalEntities : 'null';
      const existingFileTotalEntities = fileEntity.totalEntities != null ? fileEntity.totalEntities : 'null';
      this.logger.error(
        `conflicting file creation on rerun = ${rerunSync.id}, existing file = ${fileEntity.fileId} with total entities of ${existingFileTotalEntities} while rerun has total entities of ${rerunFileTotalEntities}`
      );
      throw new ConflictingRerunFileError(`rerun file = ${rerunFile.fileId} conflicting total entities`);
    }
  }
}
