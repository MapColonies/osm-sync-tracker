import { File } from '../models/file';

export const fileRepositorySymbol = Symbol('FileRepository');

export interface FileRepository {
  createFile: (file: File) => Promise<void>;
  createFiles: (files: File[]) => Promise<void>;
}
