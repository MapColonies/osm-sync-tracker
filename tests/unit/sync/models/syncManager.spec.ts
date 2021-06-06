import jsLogger from '@map-colonies/js-logger';
import { SyncManager } from '../../../../src/sync/models/syncManager';
import { createFakeSync } from '../../../helpers/helper';
import { SyncAlreadyExistsError, SyncNotFoundError } from '../../../../src/sync/models/errors';

let syncManager: SyncManager;

describe('SyncManager', () => {
  let createSync: jest.Mock;
  let getLatestSync: jest.Mock;
  let updateSync: jest.Mock;
  let findOneSync: jest.Mock;

  beforeEach(() => {
    getLatestSync = jest.fn();
    createSync = jest.fn();
    updateSync = jest.fn();
    findOneSync = jest.fn();

    const repository = { getLatestSync, createSync, updateSync, findOneSync };
    syncManager = new SyncManager(repository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createSync', () => {
    it('resolves without errors if syncId is not already in use by the db', async () => {
      const entity = createFakeSync();

      findOneSync.mockResolvedValue(undefined);
      createSync.mockResolvedValue(undefined);

      const createPromise = syncManager.createSync(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if syncId already in use by the db', async () => {
      const entity = createFakeSync();

      findOneSync.mockResolvedValue(entity);
      const createPromise = syncManager.createSync(entity);

      await expect(createPromise).rejects.toThrow(SyncAlreadyExistsError);
    });
  });

  describe('#updateSync', () => {
    it('resolves without errors if the sync is exists in the db', async () => {
      const entity = createFakeSync();

      findOneSync.mockResolvedValue(entity);
      updateSync.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(entity);

      await expect(updatePromise).resolves.not.toThrow();
    });

    it('rejects if ths sync is not exists in the db', async () => {
      const entity = createFakeSync();

      findOneSync.mockResolvedValue(undefined);
      const updatePromise = syncManager.updateSync(entity);

      await expect(updatePromise).rejects.toThrow(SyncNotFoundError);
    });
  });

  describe('#getLatestSync', () => {
    it('resolves without errors if the sync exists in the db', async () => {
      const entity = createFakeSync();

      getLatestSync.mockResolvedValue(entity);

      const getLatestPromise = syncManager.getLatestSync(entity.layerId);

      await expect(getLatestPromise).resolves.not.toThrow();
    });

    it('rejects if the sync is not exists in the db', async () => {
      const entity = createFakeSync();

      getLatestSync.mockResolvedValue(undefined);
      const getLatestPromise = syncManager.getLatestSync(entity.layerId);

      await expect(getLatestPromise).rejects.toThrow(SyncNotFoundError);
    });
  });
});
