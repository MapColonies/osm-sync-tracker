import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { SyncRepository, syncRepositorySymbol } from '../../sync/DAL/syncRepository';
import { SyncNotFoundError } from '../../sync/models/errors';
import { FileRepository, fileRepositorySymbol } from '../DAL/fileRepository';
import { File } from './file';

@injectable()
export class FileManager {
  public constructor(
    @inject(fileRepositorySymbol) private readonly fileRepository: FileRepository,
    @inject(syncRepositorySymbol) private readonly syncRepository: SyncRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createFile(file: File): Promise<void> {
    const syncEntity = await this.syncRepository.findOne(file.syncId);

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${file.syncId} not found`);
    }

    await this.fileRepository.createFile(file);
  }

  public async createFiles(files: File[]): Promise<void> {
    const syncEntity = await this.syncRepository.findOne(files[0].syncId);

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${files[0].syncId} not found`);
    }

    await this.fileRepository.createFiles(files);
  }
}
