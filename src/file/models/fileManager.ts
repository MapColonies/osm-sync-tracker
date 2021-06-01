import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import _ from 'lodash';
import { Services } from '../../common/constants';
import { SyncRepository, syncRepositorySymbol } from '../../sync/DAL/syncRepository';
import { SyncNotFoundError } from '../../sync/models/errors';
import { FileRepository, fileRepositorySymbol } from '../DAL/fileRepository';
import { FileAlreadyExistsError } from './errors';
import { File } from './file';
@injectable()
export class FileManager {
  public constructor(
    @inject(fileRepositorySymbol) private readonly fileRepository: FileRepository,
    @inject(syncRepositorySymbol) private readonly syncRepository: SyncRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createFile(file: File): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(file.syncId);

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${file.syncId} not found`);
    }

    const fileEntity = await this.fileRepository.findOneFile(file.fileId);

    if (fileEntity) {
      throw new FileAlreadyExistsError(`file = ${file.fileId} already exists`);
    }

    await this.fileRepository.createFile(file);
  }

  public async createFiles(files: File[]): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(files[0].syncId);
    const dup = _.uniqBy(files, 'fileId');

    if (dup.length !== files.length) {
      throw new FileAlreadyExistsError(`files = [${files.map((file) => file.fileId).toString()}] already exists`);
    }

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${files[0].syncId} not found`);
    }

    const filesEntities = await this.fileRepository.findManyFiles(files);

    if (filesEntities) {
      throw new FileAlreadyExistsError(`files = [${filesEntities.map((file) => file.fileId).toString()}] already exists`);
    }

    await this.fileRepository.createFiles(files);
  }
}
