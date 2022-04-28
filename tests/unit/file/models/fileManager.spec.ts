import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { FileManager } from '../../../../src/file/models/fileManager';
import { createFakeFile, createFakeSync, createFakeFiles, createFakeRerunSync } from '../../../helpers/helper';
import { ConflictingRerunFileError, DuplicateFilesError, FileAlreadyExistsError } from '../../../../src/file/models/errors';
import { SyncNotFoundError } from '../../../../src/sync/models/errors';

let fileManager: FileManager;

describe('FileManager', () => {
  const createFile = jest.fn();
  const createFiles = jest.fn();
  const findOneFile = jest.fn();
  const findManyFiles = jest.fn();
  const tryClosingFile = jest.fn();

  const getLatestSync = jest.fn();
  const findOneSync = jest.fn();
  const createSync = jest.fn();
  const updateSync = jest.fn();
  const findSyncs = jest.fn();
  const findOneSyncWithLastRerun = jest.fn();
  const createRerun = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    const fileRepository = { createFile, createFiles, findOneFile, findManyFiles, tryClosingFile };
    const syncRepository = { getLatestSync, createSync, updateSync, findOneSync, findSyncs, findOneSyncWithLastRerun, createRerun };

    fileManager = new FileManager(fileRepository, syncRepository, jsLogger({ enabled: false }));
  });

  describe('#createFile', () => {
    it('resolves without errors if fileId is not already in use by the db', async () => {
      const sync = createFakeSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(undefined);
      createFile.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(sync.id, file);

      await expect(createPromise).resolves.not.toThrow();
      expect(createFile).toHaveBeenCalled();
    });

    it('resolves without errors if fileId is not already in use by the db for rerun sync', async () => {
      const rerun = createFakeRerunSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue(undefined);
      createFile.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(rerun.id, file);

      await expect(createPromise).resolves.not.toThrow();
      expect(createFile).toHaveBeenCalled();
    });

    it('resolves without errors if fileId is already in use by the db for rerun sync', async () => {
      const rerun = createFakeRerunSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, syncId: rerun.baseSyncId });

      const createPromise = fileManager.createFile(rerun.id, file);

      await expect(createPromise).resolves.not.toThrow();
      expect(createFile).not.toHaveBeenCalled();
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

    it('rejects if on a rerun there is a conflict between existing file syncId and rerun referenceId', async () => {
      const rerun = createFakeRerunSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, syncId: 'someId' });

      const createPromise = fileManager.createFile(rerun.id, file);

      expect(createFile).not.toHaveBeenCalled();
      await expect(createPromise).rejects.toThrow(ConflictingRerunFileError);
    });

    it('rejects if on a rerun there is a conflicting value of total entities', async () => {
      const rerun = createFakeRerunSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, totalEntities: (file.totalEntities as number) - 1 });

      const createPromise = fileManager.createFile(rerun.id, file);

      expect(createFile).not.toHaveBeenCalled();
      await expect(createPromise).rejects.toThrow(ConflictingRerunFileError);
    });

    it('rejects if on a rerun there is a conflicting value of total entities and existing file total entities is null', async () => {
      const rerun = createFakeRerunSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, syncId: rerun.baseSyncId, totalEntities: null });

      const createPromise = fileManager.createFile(rerun.id, file);

      expect(createFile).not.toHaveBeenCalled();
      await expect(createPromise).rejects.toThrow(ConflictingRerunFileError);
    });

    it('rejects if on a rerun there is a conflicting value of total entities and incoming file total entities is null', async () => {
      const rerun = createFakeRerunSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, syncId: rerun.baseSyncId });

      const createPromise = fileManager.createFile(rerun.id, { ...file, totalEntities: null });

      expect(createFile).not.toHaveBeenCalled();
      await expect(createPromise).rejects.toThrow(ConflictingRerunFileError);
    });
  });

  describe('#createFiles', () => {
    it("resolves without errors if all of the filesId's are not already in use by the db", async () => {
      const files = createFakeFiles();
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFiles.mockResolvedValue(undefined);
      createFiles.mockResolvedValue(undefined);

      const createBulkPromise = fileManager.createFiles(sync.id, files);

      await expect(createBulkPromise).resolves.not.toThrow();
    });

    it("rejects if one of the filesId's already exists in the db", async () => {
      const files = createFakeFiles();
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFiles.mockResolvedValue(files);

      const createBulkPromise = fileManager.createFiles(sync.id, files);

      await expect(createBulkPromise).rejects.toThrow(FileAlreadyExistsError);
    });

    it("rejects if one of the filesId's is duplicate", async () => {
      const files = createFakeFiles();
      files.push(files[0]);
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFiles.mockResolvedValue(files);

      const createBulkPromise = fileManager.createFiles(sync.id, files);

      await expect(createBulkPromise).rejects.toThrow(DuplicateFilesError);
    });

    it('rejects if syncId is not exists in the db', async () => {
      const files = createFakeFiles();

      findOneSync.mockResolvedValue(undefined);

      const createBulkPromise = fileManager.createFiles(faker.datatype.uuid(), files);

      await expect(createBulkPromise).rejects.toThrow(SyncNotFoundError);
    });
  });
});
