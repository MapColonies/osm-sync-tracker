import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import lodash from 'lodash';
import { SERVICES } from '../../common/constants';
import { ISyncRepository, syncRepositorySymbol } from '../../sync/DAL/syncRepository';
import { SyncNotFoundError } from '../../sync/models/errors';
import { IFileRepository, fileRepositorySymbol } from '../DAL/fileRepository';
import { IRerunRepository, rerunRepositorySymbol } from '../../sync/DAL/rerunRepository';
import { ConflictingRerunFileError, DuplicateFilesError, FileAlreadyExistsError } from './errors';
import { File } from './file';

@injectable()
export class FileManager {
  public constructor(
    @inject(fileRepositorySymbol) private readonly fileRepository: IFileRepository,
    @inject(syncRepositorySymbol) private readonly syncRepository: ISyncRepository,
    @inject(rerunRepositorySymbol) private readonly rerunRepository: IRerunRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}

  public async createFile(syncId: string, file: File): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(syncId);

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    if (syncEntity.isRerun) {
      return this.createRerunFile(syncId, file);
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

  private async createRerunFile(rerunSyncId: string, rerunFile: File): Promise<void> {
    const rerunEntity = await this.rerunRepository.findOneRerun(rerunSyncId);

    if (!rerunEntity) {
      throw new SyncNotFoundError(`rerun sync = ${rerunSyncId} not found`);
    }
    const fileEntity = await this.fileRepository.findOneFile(rerunFile.fileId);

    if (!fileEntity) {
      return this.fileRepository.createFile({ ...rerunFile, syncId: rerunEntity.referenceId });
    }

    if (rerunEntity.referenceId != fileEntity.syncId) {
      this.logger.error(
        `conflicting file creation on rerun = ${rerunSyncId}, existing file = ${fileEntity.fileId} with syncId ${fileEntity.syncId} while rerun has referencing syncId ${rerunEntity.referenceId}`
      );
      throw new ConflictingRerunFileError(`rerun file = ${rerunFile.fileId} conflicting sync id`);
    }

    if (rerunFile.totalEntities != fileEntity.totalEntities) {
      const rerunFileTotalEntities = rerunFile.totalEntities != null ? rerunFile.totalEntities : 'null';
      const existingFileTotalEntities = fileEntity.totalEntities != null ? fileEntity.totalEntities : 'null';
      this.logger.error(
        `conflicting file creation on rerun = ${rerunSyncId}, existing file = ${fileEntity.fileId} with total entities of ${existingFileTotalEntities} while rerun has total entities of ${rerunFileTotalEntities}`
      );
      throw new ConflictingRerunFileError(`rerun file = ${rerunFile.fileId} conflicting total entities`);
    }
  }
}
