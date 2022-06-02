import { File, FileUpdate } from '../models/file';
import { File as FileDb } from './typeorm/file';

export const fileRepositorySymbol = Symbol('FileRepository');

export interface IFileRepository {
  createFile: (file: File) => Promise<void>;

  createFiles: (files: File[]) => Promise<void>;

  updateFile: (fileId: string, updatedFile: FileUpdate) => Promise<void>;

  findOneFile: (fileId: string) => Promise<FileDb | undefined>;

  findManyFiles: (files: File[]) => Promise<FileDb[] | undefined>;

  tryClosingFile: (fileId: string, schema: string) => Promise<string[]>;
}
