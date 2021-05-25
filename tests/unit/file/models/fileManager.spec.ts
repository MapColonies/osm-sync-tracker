import jsLogger from '@map-colonies/js-logger';
import { FileManager } from '../../../../src/file/models/fileManager';
import { File } from '../../../../src/file/models/file';
import { createFakeFile } from '../../../helpers/helper';
import { FileRepository } from '../../../../src/file/DAL/fileRepository';
import { FileAlreadyExistsError } from '../../../../src/file/models/errors';

let fileManager: FileManager;

describe('FileManager', () => {
  let createFile: jest.Mock;
  let createFiles: jest.Mock;

  beforeEach(() => {
    createFile = jest.fn();
    createFiles = jest.fn();

    const repository = ({ createFile, createFiles } as unknown) as FileRepository;
    fileManager = new FileManager(repository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createFile', () => {
    it('resolves without errors if id are not used', async () => {
      createFile.mockResolvedValue(undefined);
      const entity = createFakeFile();

      const createPromise = fileManager.createFile(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if id already exists', async () => {
      const entity = createFakeFile();
      createFile.mockRejectedValue(new FileAlreadyExistsError(`file = ${entity.fileId} already exists`));

      const createPromise = fileManager.createFile(entity);

      await expect(createPromise).rejects.toThrow(FileAlreadyExistsError);
    });
  });

  describe('#createFiles', () => {
    it("resolves without errors if id's are not used", async () => {
      createFiles.mockResolvedValue(undefined);
      const entities: File[] = [];

      entities.push(createFakeFile());
      entities.push(createFakeFile());
      entities.push(createFakeFile());

      const createPromise = fileManager.createFiles(entities);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if id not exists', async () => {
      const entities: File[] = [];

      entities.push(createFakeFile());
      entities.push(createFakeFile());
      entities.push(createFakeFile());

      createFiles.mockRejectedValue(new FileAlreadyExistsError(`files = [${entities.map((file) => file.fileId).toString()}] already exists`));

      const createPromise = fileManager.createFiles(entities);

      await expect(createPromise).rejects.toThrow(FileAlreadyExistsError);
    });
  });
});
