import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { FileRepository, fileRepositorySymbol } from '../DAL/fileRepository';
import { File } from './file';

@injectable()
export class FileManager {
  public constructor(
    @inject(fileRepositorySymbol) private readonly fileRepository: FileRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createFile(file: File): Promise<void> {
    await this.fileRepository.createFile(file);
  }

  public async createFiles(files: File[]): Promise<void> {
    await this.fileRepository.createFiles(files);
  }
}
