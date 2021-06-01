import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { FileManager } from '../../../../src/file/models/fileManager';
import { createFakeFile, createFakeSync, createFakeFiles } from '../../../helpers/helper';
import { FileAlreadyExistsError } from '../../../../src/file/models/errors';
import { SyncNotFoundError } from '../../../../src/sync/models/errors';

let fileManager: FileManager;

describe('FileManager', () => {
  let createFile: jest.Mock;
  let createFiles: jest.Mock;
  let findOneFile: jest.Mock;
  let findManyFiles: jest.Mock;

  let getLatestSync: jest.Mock;
  let createSync: jest.Mock;
  let updateSync: jest.Mock;
  let findOneSync: jest.Mock;

  beforeEach(() => {
    createFile = jest.fn();
    createFiles = jest.fn();
    findOneFile = jest.fn();
    findManyFiles = jest.fn();

    getLatestSync = jest.fn();
    findOneSync = findOneSync = jest.fn();
    createSync = jest.fn();
    updateSync = jest.fn();

    const repository = { createFile, createFiles, findOneFile, findManyFiles };
    const syncRepository = { getLatestSync, createSync, updateSync, findOneSync };

    fileManager = new FileManager(repository, syncRepository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createFile', () => {
    it('resolves without errors if fileId are not used', async () => {
      const sync = createFakeSync();
      const entity = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(undefined);
      createFile.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if fileId already exists', async () => {
      const file = createFakeFile();
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(file);

      const createPromise = fileManager.createFile(file);

      await expect(createPromise).rejects.toThrow(FileAlreadyExistsError);
    });

    it('rejects if syncId not exists', async () => {
      const file = createFakeFile();

      findOneSync.mockResolvedValue(undefined);
      findOneFile.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(file);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });

  describe('#createFiles', () => {
    it("resolves without errors if fileId's are not used", async () => {
      const files = createFakeFiles(faker.datatype.number());
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFiles.mockResolvedValue(undefined);
      createFiles.mockResolvedValue(undefined);

      const createPromise = fileManager.createFiles(files);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if fileId already exists', async () => {
      const files = createFakeFiles(faker.datatype.number());
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFiles.mockResolvedValue(files);

      const createPromise = fileManager.createFiles(files);

      await expect(createPromise).rejects.toThrow(FileAlreadyExistsError);
    });

    it('rejects if syncId not exists', async () => {
      const files = createFakeFiles(faker.datatype.number());

      findOneSync.mockResolvedValue(undefined);

      const createPromise = fileManager.createFiles(files);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });
});
