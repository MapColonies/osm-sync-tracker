import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { FileManager } from '../../../../src/file/models/fileManager';
import { createFakeFile, createFakeSync, createFakeFiles } from '../../../helpers/helper';
import { DuplicateFilesError, FileAlreadyExistsError } from '../../../../src/file/models/errors';
import { SyncNotFoundError } from '../../../../src/sync/models/errors';

let fileManager: FileManager;

describe('FileManager', () => {
  let createFile: jest.Mock;
  let createFiles: jest.Mock;
  let findOneFile: jest.Mock;
  let findManyFiles: jest.Mock;
  let tryClosingFile: jest.Mock;

  let getLatestSync: jest.Mock;
  let createSync: jest.Mock;
  let updateSync: jest.Mock;
  let findOneSync: jest.Mock;
  let findFullSyncByLayerAndGeometry: jest.Mock;

  beforeEach(() => {
    createFile = jest.fn();
    createFiles = jest.fn();
    findOneFile = jest.fn();
    findManyFiles = jest.fn();
    tryClosingFile = jest.fn();

    getLatestSync = jest.fn();
    findOneSync = jest.fn();
    createSync = jest.fn();
    updateSync = jest.fn();
    findFullSyncByLayerAndGeometry = jest.fn();

    const repository = { createFile, createFiles, findOneFile, findManyFiles, tryClosingFile };
    const syncRepository = { getLatestSync, createSync, updateSync, findOneSync, findFullSyncByLayerAndGeometry };

    fileManager = new FileManager(repository, syncRepository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createFile', () => {
    it('resolves without errors if fileId is not already in use by the db', async () => {
      const sync = createFakeSync();
      const entity = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(undefined);
      createFile.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(sync.id, entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if fileId already in use by the db', async () => {
      const file = createFakeFile();
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(file);

      const createPromise = fileManager.createFile(sync.id, file);

      await expect(createPromise).rejects.toThrow(FileAlreadyExistsError);
    });

    it('rejects if syncId not exists in the db', async () => {
      const file = createFakeFile();

      findOneSync.mockResolvedValue(undefined);
      findOneFile.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(faker.datatype.uuid(), file);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });

  describe('#createFiles', () => {
    it("resolves without errors if all of the filesId's are not already in use by the db", async () => {
      const files = createFakeFiles(faker.datatype.number());
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFiles.mockResolvedValue(undefined);
      createFiles.mockResolvedValue(undefined);

      const createBulkPromise = fileManager.createFiles(sync.id, files);

      await expect(createBulkPromise).resolves.not.toThrow();
    });

    it("rejects if one of the filesId's already exists in the db", async () => {
      const files = createFakeFiles(faker.datatype.number());
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFiles.mockResolvedValue(files);

      const createBulkPromise = fileManager.createFiles(sync.id, files);

      await expect(createBulkPromise).rejects.toThrow(FileAlreadyExistsError);
    });

    it("rejects if one of the filesId's is duplicate", async () => {
      const files = createFakeFiles(faker.datatype.number());
      files.push(files[0]);
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFiles.mockResolvedValue(files);

      const createBulkPromise = fileManager.createFiles(sync.id, files);

      await expect(createBulkPromise).rejects.toThrow(DuplicateFilesError);
    });

    it('rejects if syncId is not exists in the db', async () => {
      const files = createFakeFiles(faker.datatype.number());

      findOneSync.mockResolvedValue(undefined);

      const createBulkPromise = fileManager.createFiles(faker.datatype.uuid(), files);

      await expect(createBulkPromise).rejects.toThrow(SyncNotFoundError);
    });
  });
});
