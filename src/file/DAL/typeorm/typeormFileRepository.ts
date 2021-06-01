import { EntityRepository, Repository } from 'typeorm';
import { File } from '../../models/file';
import { FileRepository } from '../fileRepository';
import { File as FileDb } from './file';

@EntityRepository(FileDb)
export class TypeormFileRepository extends Repository<FileDb> implements FileRepository {
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
}
