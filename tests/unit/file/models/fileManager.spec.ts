import jsLogger from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import { FileManager } from '../../../../src/file/models/fileManager';
import { FileRepository } from '../../../../src/file/DAL/fileRepository';
import { SyncRepository } from '../../../../src/sync/DAL/syncRepository';
import { createFakeFile, createFakeSync, createFakeFiles, createFakeRerunSync } from '../../../helpers/helper';
import { ConflictingRerunFileError, DuplicateFilesError, FileAlreadyExistsError, FileNotFoundError } from '../../../../src/file/models/errors';
import { SyncNotFoundError } from '../../../../src/sync/models/errors';
import { DEFAULT_ISOLATION_LEVEL } from '../../../integration/helpers';
import { ExceededNumberOfRetriesError, TransactionFailureError } from '../../../../src/common/errors';
import { JobQueueProvider } from '../../../../src/queueProvider/interfaces';
import { ClosureJob } from '../../../../src/queueProvider/types';

let fileManager: FileManager;

let fileRepository: FileRepository;
let syncRepository: SyncRepository;
let queue: JobQueueProvider<ClosureJob>;

describe('FileManager', () => {
  const createFile = jest.fn();
  const createFiles = jest.fn();
  const findOneFile = jest.fn();
  const updateFile = jest.fn();
  const findManyFilesByIds = jest.fn();
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

    fileRepository = { createFile, createFiles, findOneFile, findManyFilesByIds, tryClosingFile, updateFile } as unknown as FileRepository;

    syncRepository = {
      getLatestSync,
      createSync,
      updateSync,
      findOneSync,
      findSyncs,
      findOneSyncWithLastRerun,
      createRerun,
    } as unknown as SyncRepository;

    queue = {
      push: jest.fn(),
    } as unknown as JobQueueProvider<ClosureJob>;

    fileManager = new FileManager(
      fileRepository,
      syncRepository,
      jsLogger({ enabled: false }),
      { get: jest.fn(), has: jest.fn() },
      { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL },
      queue
    );
  });

  describe('#updateFile', () => {
    it('resolves without errors for valid update file', async () => {
      const sync = createFakeSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(file);
      updateFile.mockResolvedValue(undefined);
      tryClosingFile.mockResolvedValue([]);

      const updatePromise = fileManager.updateFile(sync.id, file.fileId, { totalEntities: 1 });

      await expect(updatePromise).resolves.not.toThrow();
      expect(updateFile).toHaveBeenCalled();
    });

    it('resolves without errors for valid update file when retry policy is configured and transaction fails once', async () => {
      const sync = createFakeSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(file);
      updateFile.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValueOnce(new TransactionFailureError('transaction failure')).mockResolvedValueOnce([]);

      const fileManagerWithRetries = new FileManager(
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, numRetries: 1 }, isolationLevel: DEFAULT_ISOLATION_LEVEL },
        queue
      );
      const updatePromise = fileManagerWithRetries.updateFile(sync.id, file.fileId, { totalEntities: 1 });

      await expect(updatePromise).resolves.not.toThrow();
      expect(tryClosingFile).toHaveBeenCalledTimes(2);
    });

    it('rejects if a sync not found', async () => {
      const sync = createFakeSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(undefined);

      const updatePromise = fileManager.updateFile(sync.id, file.fileId, { totalEntities: 1 });

      await expect(updatePromise).rejects.toThrow(SyncNotFoundError);
      expect(updateFile).not.toHaveBeenCalled();
    });

    it('rejects if a file not found', async () => {
      const sync = createFakeSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(undefined);

      const updatePromise = fileManager.updateFile(sync.id, file.fileId, { totalEntities: 1 });

      await expect(updatePromise).rejects.toThrow(FileNotFoundError);
      expect(updateFile).not.toHaveBeenCalled();
    });

    it('rejects with exceeded number of retries error if closing file has failed when retries is configured', async () => {
      const sync = createFakeSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(file);
      updateFile.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValue(new TransactionFailureError('transaction failure'));

      const retries = faker.datatype.number({ min: 1, max: 10 });
      const fileManagerWithRetries = new FileManager(
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL },
        queue
      );

      const updatePromise = fileManagerWithRetries.updateFile(sync.id, file.fileId, { totalEntities: 1 });

      await expect(updatePromise).rejects.toThrow(ExceededNumberOfRetriesError);
      expect(tryClosingFile).toHaveBeenCalledTimes(retries + 1);
    });

    it('rejects with transaction failure error if closing file fails', async () => {
      const sync = createFakeSync();
      const file = createFakeFile();

      findOneSync.mockResolvedValue(sync);
      findOneFile.mockResolvedValue(file);
      updateFile.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValue(new TransactionFailureError('transaction failure'));

      const fileManagerWithRetries = new FileManager(
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL },
        queue
      );

      const closePromise = fileManagerWithRetries.updateFile(sync.id, file.fileId, { totalEntities: 1 });

      await expect(closePromise).rejects.toThrow(TransactionFailureError);
      expect(tryClosingFile).toHaveBeenCalledTimes(1);
    });
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
      findManyFilesByIds.mockResolvedValue(undefined);
      createFiles.mockResolvedValue(undefined);

      const createBulkPromise = fileManager.createFiles(sync.id, files);

      await expect(createBulkPromise).resolves.not.toThrow();
    });

    it("rejects if one of the filesId's already exists in the db", async () => {
      const files = createFakeFiles();
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFilesByIds.mockResolvedValue(files);

      const createBulkPromise = fileManager.createFiles(sync.id, files);

      await expect(createBulkPromise).rejects.toThrow(FileAlreadyExistsError);
    });

    it("rejects if one of the filesId's is duplicate", async () => {
      const files = createFakeFiles();
      files.push(files[0]);
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      findManyFilesByIds.mockResolvedValue(files);

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
