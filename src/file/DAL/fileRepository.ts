import { FindOneOptions, ObjectID } from 'typeorm';
import { File } from '../models/file';

export const fileRepositorySymbol = Symbol('FileRepository');

export interface FileRepository {
  createFile: (file: File) => Promise<void>;

  createFiles: (files: File[]) => Promise<void>;

  findOne: (id?: string | number | Date | ObjectID, options?: FindOneOptions<File>) => Promise<File | undefined>;
}
