import { EntityRepository, Repository } from 'typeorm';
import { File } from '../../models/file';
import { FileRepository } from '../fileRepository';
import { File as FileDb } from './file';

@EntityRepository(FileDb)
export class TypeormFileRepository extends Repository<FileDb> implements FileRepository {
  public async createFile(file: File): Promise<void> {
    await this.save(file);
  }
  public async createFiles(files: File[]): Promise<void> {
    await this.save(files);
  }
}
