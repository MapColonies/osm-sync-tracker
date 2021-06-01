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
    it('resolves without errors if id are not used', async () => {
      const entity = createFakeSync();

      findOneSync.mockResolvedValue(undefined);
      createSync.mockResolvedValue(undefined);

      const createPromise = syncManager.createSync(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if id already exists', async () => {
      const entity = createFakeSync();

      findOneSync.mockResolvedValue(entity);
      //createSync.mockRejectedValue();

      const createPromise = syncManager.createSync(entity);

      await expect(createPromise).rejects.toThrow(SyncAlreadyExistsError);
    });
  });

  describe('#updateSync', () => {
    it('resolves without errors if id exists', async () => {
      const entity = createFakeSync();

      findOneSync.mockResolvedValue(entity);
      updateSync.mockResolvedValue(undefined);

      const createPromise = syncManager.updateSync(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if id not exists', async () => {
      const entity = createFakeSync();

      findOneSync.mockResolvedValue(undefined);
      //updateSync.mockRejectedValue(new SyncNotFoundError(`sync = ${entity.id} not found`));

      const createPromise = syncManager.updateSync(entity);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });

  describe('#getLatestSync', () => {
    it('resolves without errors if id exists', async () => {
      const entity = createFakeSync();

      getLatestSync.mockResolvedValue(entity);

      const createPromise = syncManager.getLatestSync(entity.layerId);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if id not exists', async () => {
      const entity = createFakeSync();

      getLatestSync.mockResolvedValue(undefined);

      const createPromise = syncManager.getLatestSync(entity.layerId);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });
});
