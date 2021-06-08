import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import lodash from 'lodash';
import { Services } from '../../common/constants';
import { ISyncRepository, syncRepositorySymbol } from '../../sync/DAL/syncRepository';
import { SyncNotFoundError } from '../../sync/models/errors';
import { IFileRepository, fileRepositorySymbol } from '../DAL/fileRepository';
import { DuplicateFilesError, FileAlreadyExistsError } from './errors';
import { File } from './file';

@injectable()
export class FileManager {
  public constructor(
    @inject(fileRepositorySymbol) private readonly fileRepository: IFileRepository,
    @inject(syncRepositorySymbol) private readonly syncRepository: ISyncRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createFile(syncId: string, file: File): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(syncId);
    file.syncId = syncId;

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    const fileEntity = await this.fileRepository.findOneFile(file.fileId);

    if (fileEntity) {
      throw new FileAlreadyExistsError(`file = ${file.fileId} already exists`);
    }

    await this.fileRepository.createFile(file);
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
}
