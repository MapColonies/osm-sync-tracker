import { FindOneOptions, ObjectID } from 'typeorm';
import { File } from '../models/file';
import { File as FileDb } from './typeorm/file';

export const fileRepositorySymbol = Symbol('FileRepository');

export interface FileRepository {
  createFile: (file: File) => Promise<void>;

  createFiles: (files: File[]) => Promise<void>;

  findOne: (id?: string | number | Date | ObjectID, options?: FindOneOptions<FileDb>) => Promise<FileDb | undefined>;
}
