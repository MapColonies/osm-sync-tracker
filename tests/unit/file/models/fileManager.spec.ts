import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { FileManager } from '../../../../src/file/models/fileManager';
import { createFakeFile, createFakeSync, createFakeFiles, createFakeRerun } from '../../../helpers/helper';
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
  const findOneSyncWithReruns = jest.fn();

  const createRerun = jest.fn();
  const findOneRerun = jest.fn();
  const findReruns = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    const fileRepository = { createFile, createFiles, findOneFile, findManyFiles, tryClosingFile };
    const syncRepository = { getLatestSync, createSync, updateSync, findOneSync, findSyncs, findOneSyncWithReruns };
    const rerunRepository = { createRerun, findOneRerun, findReruns };

    fileManager = new FileManager(fileRepository, syncRepository, rerunRepository, jsLogger({ enabled: false }));
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
      const sync = createFakeSync({ isRerun: true });
      const rerun = createFakeRerun();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneRerun.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue(undefined);
      createFile.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(sync.id, file);

      await expect(createPromise).resolves.not.toThrow();
      expect(createFile).toHaveBeenCalled();
    });

    it('resolves without errors if fileId is already in use by the db for rerun sync', async () => {
      const sync = createFakeSync({ isRerun: true });
      const rerun = createFakeRerun();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneRerun.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, syncId: rerun.referenceId });

      const createPromise = fileManager.createFile(sync.id, file);

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

    it('rejects if on a rerun sync rerun not exists in the db', async () => {
      const sync = createFakeSync({ isRerun: true });
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneRerun.mockResolvedValue(undefined);

      const createPromise = fileManager.createFile(sync.id, file);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });

    it('rejects if on a rerun there is a conflict between existing file syncId and rerun referenceId', async () => {
      const sync = createFakeSync({ isRerun: true });
      const rerun = createFakeRerun();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneRerun.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, syncId: 'someId' });

      const createPromise = fileManager.createFile(sync.id, file);

      expect(createFile).not.toHaveBeenCalled();
      await expect(createPromise).rejects.toThrow(ConflictingRerunFileError);
    });

    it('rejects if on a rerun there is a conflicting value of total entities', async () => {
      const sync = createFakeSync({ isRerun: true });
      const rerun = createFakeRerun();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneRerun.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, totalEntities: (file.totalEntities as number) - 1 });

      const createPromise = fileManager.createFile(sync.id, file);

      expect(createFile).not.toHaveBeenCalled();
      await expect(createPromise).rejects.toThrow(ConflictingRerunFileError);
    });

    it('rejects if on a rerun there is a conflicting value of total entities and existing file total entities is null', async () => {
      const sync = createFakeSync({ isRerun: true });
      const rerun = createFakeRerun();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneRerun.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, syncId: rerun.referenceId, totalEntities: null });

      const createPromise = fileManager.createFile(sync.id, file);

      expect(createFile).not.toHaveBeenCalled();
      await expect(createPromise).rejects.toThrow(ConflictingRerunFileError);
    });

    it('rejects if on a rerun there is a conflicting value of total entities and incoming file total entities is null', async () => {
      const sync = createFakeSync({ isRerun: true });
      const rerun = createFakeRerun();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneRerun.mockResolvedValue(rerun);
      findOneFile.mockResolvedValue({ ...file, syncId: rerun.referenceId });

      const createPromise = fileManager.createFile(sync.id, { ...file, totalEntities: null });

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
