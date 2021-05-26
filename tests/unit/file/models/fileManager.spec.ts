import jsLogger from '@map-colonies/js-logger';
import { FileManager } from '../../../../src/file/models/fileManager';
import { File } from '../../../../src/file/models/file';
import { createFakeFile, createFakeSync } from '../../../helpers/helper';
import { FileAlreadyExistsError } from '../../../../src/file/models/errors';
import { SyncNotFoundError } from '../../../../src/sync/models/errors';

let fileManager: FileManager;

describe('FileManager', () => {
  let createFile: jest.Mock;
  let createFiles: jest.Mock;
  let findOne: jest.Mock;
  let getLatestSync: jest.Mock;
  let findOneSync: jest.Mock;
  let createSync: jest.Mock;
  let updateSync: jest.Mock;

  beforeEach(() => {
    createFile = jest.fn();
    createFiles = jest.fn();
    findOne = jest.fn();
    getLatestSync = jest.fn();
    findOne = findOneSync = jest.fn();
    createSync = jest.fn();
    updateSync = jest.fn();

    const repository = { createFile, createFiles, findOne };
    const syncRepository = { getLatestSync, findOne, createSync, updateSync };

    fileManager = new FileManager(repository, syncRepository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createFile', () => {
    it('resolves without errors if fileId are not used', async () => {
      const sync = createFakeSync();
      const entity = createFakeFile();
      createFile.mockResolvedValue(undefined);
      findOneSync.mockResolvedValue(sync);

      const createPromise = fileManager.createFile(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if fileId already exists', async () => {
      const entity = createFakeFile();
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      createFile.mockRejectedValue(new FileAlreadyExistsError(`file = ${entity.fileId} already exists`));

      const createPromise = fileManager.createFile(entity);

      await expect(createPromise).rejects.toThrow(FileAlreadyExistsError);
    });

    it('rejects if syncId not exists', async () => {
      const entity = createFakeFile();

      findOneSync.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(entity);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });

  describe('#createFiles', () => {
    it("resolves without errors if fileId's are not used", async () => {
      createFiles.mockResolvedValue(undefined);
      const entities: File[] = [];
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);

      entities.push(createFakeFile());
      entities.push(createFakeFile());
      entities.push(createFakeFile());

      const createPromise = fileManager.createFiles(entities);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if fileId not exists', async () => {
      const entities: File[] = [];
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);

      entities.push(createFakeFile());
      entities.push(createFakeFile());
      entities.push(createFakeFile());

      createFiles.mockRejectedValue(new FileAlreadyExistsError(`files = [${entities.map((file) => file.fileId).toString()}] already exists`));

      const createPromise = fileManager.createFiles(entities);

      await expect(createPromise).rejects.toThrow(FileAlreadyExistsError);
    });

    it('rejects if syncId not exists', async () => {
      const entities: File[] = [];

      findOneSync.mockResolvedValue(undefined);

      entities.push(createFakeFile());
      entities.push(createFakeFile());
      entities.push(createFakeFile());

      const createPromise = fileManager.createFiles(entities);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });
});
