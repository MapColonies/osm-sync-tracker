import { EntityRepository, Repository } from 'typeorm';
import { FileAlreadyExistsError } from '../../models/errors';
import { File } from '../../models/file';
import { FileRepository } from '../fileRepository';
import { File as FileDb } from './file';

@EntityRepository(FileDb)
export class TypeormFileRepository extends Repository<FileDb> implements FileRepository {
  public async createFile(file: File): Promise<void> {
    const fileEntity = await this.findOne(file);
    if (fileEntity) {
      throw new FileAlreadyExistsError(`file = ${file.fileId} already exists`);
    }
    await this.save(file);
  }
  public async createFiles(files: File[]): Promise<void> {
    const filesEntities = await this.findByIds(files);
    if (filesEntities.length > 0) {
      throw new FileAlreadyExistsError(`files = [${filesEntities.map((file) => file.fileId).toString()}] already exists`);
    }
    await this.save(files);
  }
}
