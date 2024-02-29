import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import lodash from 'lodash';
import { SERVICES } from '../../common/constants';
import { SYNC_CUSTOM_REPOSITORY_SYMBOL, SyncRepository } from '../../sync/DAL/syncRepository';
import { SyncNotFoundError } from '../../sync/models/errors';
import { FILE_CUSTOM_REPOSITORY_SYMBOL, FileRepository } from '../DAL/fileRepository';
import { Sync } from '../../sync/models/sync';
import { TransactionFailureError } from '../../changeset/models/errors';
import { retryFunctionWrapper } from '../../common/utils/retryFunctionWrapper';
import { IApplication, IConfig, TransactionRetryPolicy } from '../../common/interfaces';
import { ConflictingRerunFileError, DuplicateFilesError, FileAlreadyExistsError, FileNotFoundError } from './errors';
import { File, FileUpdate } from './file';

@injectable()
export class FileManager {
  private readonly dbSchema: string;
  private readonly transactionRetryPolicy: TransactionRetryPolicy;

  public constructor(
    @inject(FILE_CUSTOM_REPOSITORY_SYMBOL) private readonly fileRepository: FileRepository,
    @inject(SYNC_CUSTOM_REPOSITORY_SYMBOL) private readonly syncRepository: SyncRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.APPLICATION) private readonly appConfig: IApplication
  ) {
    this.dbSchema = this.config.get('db.schema');
    this.transactionRetryPolicy = this.appConfig.transactionRetryPolicy;
  }

  public async createFile(syncId: string, file: File): Promise<void> {
    this.logger.info({ msg: 'creating file on sync', syncId, fileId: file.fileId });

    const syncEntity = await this.syncRepository.findOneSync(syncId);

    if (!syncEntity) {
      this.logger.error({ msg: 'could not create file on sync due to sync not existing', syncId, fileId: file.fileId });
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    if (syncEntity.baseSyncId != null) {
      return this.createRerunFile(syncEntity, file);
    }

    const fileEntity = await this.fileRepository.findOneFile(file.fileId);

    if (fileEntity) {
      this.logger.error({ msg: 'could not create file due to file with the same id already existing', syncId, fileId: file.fileId });
      throw new FileAlreadyExistsError(`file = ${file.fileId} already exists`);
    }

    await this.fileRepository.createFile({ ...file, syncId });
  }

  public async createFiles(syncId: string, files: File[]): Promise<void> {
    const uniqueFileIds = lodash.uniqBy(files, 'fileId');

    if (uniqueFileIds.length !== files.length) {
      this.logger.error({
        msg: 'could not create files due to request having duplicate file ids',
        fileIdsCount: files.length,
        uniqueFileIdCount: uniqueFileIds.length,
        syncId,
      });
      throw new DuplicateFilesError(`files = [${uniqueFileIds.map((file) => file.fileId).toString()}] are duplicate`);
    }

    const syncEntity = await this.syncRepository.findOneSync(syncId);

    if (!syncEntity) {
      this.logger.error({ msg: 'could not create files on sync due to sync not existing', syncId, filesCount: files.length });
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    const filesEntities = await this.fileRepository.findManyFilesByIds(files);

    if (filesEntities) {
      const alreadyExistingFileIds = filesEntities.map((file) => file.fileId);
      this.logger.error({
        msg: 'could not create files due to at least one file with the same id already existing',
        syncId,
        alreadyExistingFilesCount: filesEntities.length,
        alreadyExistingFileIds,
      });
      throw new FileAlreadyExistsError(`files = [${alreadyExistingFileIds.toString()}] already exists`);
    }

    const filesWithSyncId = files.map((file) => ({ ...file, syncId }));
    await this.fileRepository.createFiles(filesWithSyncId);
  }

  public async updateFile(syncId: string, fileId: string, fileUpdate: FileUpdate): Promise<string[]> {
    this.logger.info({ msg: 'updating file on sync', syncId, fileId: fileId, fileUpdate });

    const syncEntity = await this.syncRepository.findOneSync(syncId);

    if (!syncEntity) {
      this.logger.error({ msg: 'could not update file on sync due to sync not existing', syncId, fileId });
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    const fileEntity = await this.fileRepository.findOneFile(fileId);

    if (!fileEntity) {
      this.logger.error({ msg: 'could not update file on sync due to file not existing', syncId, fileId });
      throw new FileNotFoundError(`file = ${fileId} not found`);
    }

    await this.fileRepository.updateFile(fileId, fileUpdate);

    const closeFileCronFeature = this.appConfig.featureFlags?.closeFileCron ?? false;
    //Feature flag to Close File By Cron Job
    if (closeFileCronFeature) {
      return [];
    }
    // try closing the file which in turn if if succeeded will try compliting the sync
    const completedSyncIds = await this.closeFile(fileId);

    this.logger.debug({
      msg: 'closing file resulted in the complition of following syncs',
      fileId,
      syncId,
      completedSyncIds,
      completedSyncIdsCount: completedSyncIds.length,
    });

    return completedSyncIds;
  }

  public async tryCloseOpenPossibleFiles(): Promise<string[]> {
    this.logger.info({ msg: 'attempting to close all open files', transactionRetryPolicy: this.transactionRetryPolicy });

    if (!this.transactionRetryPolicy.enabled) {
      const results = await this.fileRepository.tryCloseAllOpenFilesTransaction(this.dbSchema);
      return results;
    }
    const retryOptions = { retryErrorType: TransactionFailureError, numberOfRetries: this.transactionRetryPolicy.numRetries as number };
    const functionRef = this.fileRepository.tryCloseAllOpenFilesTransaction.bind(this.fileRepository);
    return retryFunctionWrapper(retryOptions, functionRef, this.dbSchema);
  }

  private async createRerunFile(rerunSync: Sync, rerunFile: File): Promise<void> {
    this.logger.info({
      msg: 'creating rerun file on base sync if file not already existing on base sync',
      rerunSyncId: rerunSync.id,
      baseSyncId: rerunSync.baseSyncId,
      fileId: rerunFile.fileId,
    });

    const fileEntity = await this.fileRepository.findOneFile(rerunFile.fileId);

    if (!fileEntity) {
      return this.fileRepository.createFile({ ...rerunFile, syncId: rerunSync.baseSyncId as string });
    }

    if (rerunSync.baseSyncId != fileEntity.syncId) {
      this.logger.error({
        msg: 'conflicting file creation on rerun, existing file with another sync id already exists',
        rerunSyncId: rerunSync.id,
        baseSyncId: rerunSync.baseSyncId,
        fileId: rerunFile.fileId,
        existingFileSyncId: fileEntity.syncId,
      });
      throw new ConflictingRerunFileError(`rerun file = ${rerunFile.fileId} conflicting sync id`);
    }

    if (rerunFile.totalEntities != fileEntity.totalEntities) {
      const rerunFileTotalEntities = rerunFile.totalEntities != null ? rerunFile.totalEntities : 'null';
      const existingFileTotalEntities = fileEntity.totalEntities != null ? fileEntity.totalEntities : 'null';
      this.logger.error({
        msg: 'conflicting file creation on rerun, file already exists with another value of total entities',
        rerunSyncId: rerunSync.id,
        fileId: fileEntity.fileId,
        rerunFileTotalEntities,
        existingFileTotalEntities,
      });
      throw new ConflictingRerunFileError(`rerun file = ${rerunFile.fileId} conflicting total entities`);
    }
  }

  private async closeFile(fileId: string): Promise<string[]> {
    this.logger.info({ msg: 'attempting to close file', fileId, transactionRetryPolicy: this.transactionRetryPolicy });

    if (!this.transactionRetryPolicy.enabled) {
      return this.fileRepository.tryClosingFile(fileId, this.dbSchema);
    }

    const retryOptions = { retryErrorType: TransactionFailureError, numberOfRetries: this.transactionRetryPolicy.numRetries as number };
    const functionRef = this.fileRepository.tryClosingFile.bind(this.fileRepository);
    return retryFunctionWrapper(retryOptions, functionRef, fileId, this.dbSchema);
  }
}
