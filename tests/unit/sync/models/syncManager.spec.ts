import jsLogger from '@map-colonies/js-logger';
import { SyncManager } from '../../../../src/sync/models/syncManager';
import { createFakeSync } from '../../../helpers/helper';
import { SyncRepository } from '../../../../src/sync/DAL/syncRepository';
import { SyncAlreadyExistsError, SyncNotFoundError } from '../../../../src/sync/models/errors';

let syncManager: SyncManager;

describe('EntityManager', () => {
  let createSync: jest.Mock;
  let getLatestSync: jest.Mock;
  let updateSync: jest.Mock;

  beforeEach(() => {
    getLatestSync = jest.fn();
    createSync = jest.fn();
    updateSync = jest.fn();

    const repository = ({ getLatestSync, createSync, updateSync } as unknown) as SyncRepository;
    syncManager = new SyncManager(repository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createSync', () => {
    it('resolves without errors if id are not used', async () => {
      createSync.mockResolvedValue(undefined);
      const entity = createFakeSync();

      const createPromise = syncManager.createSync(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if id already exists', async () => {
      const entity = createFakeSync();
      createSync.mockRejectedValue(new SyncAlreadyExistsError(`sync = ${entity.id} already exists`));

      const createPromise = syncManager.createSync(entity);

      await expect(createPromise).rejects.toThrow(SyncAlreadyExistsError);
    });
  });

  describe('#updateSync', () => {
    it('resolves without errors if id exists', async () => {
      createSync.mockResolvedValue(undefined);
      const entity = createFakeSync();

      const createPromise = syncManager.updateSync(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if id not exists', async () => {
      const entity = createFakeSync();
      updateSync.mockRejectedValue(new SyncNotFoundError(`sync = ${entity.id} not found`));

      const createPromise = syncManager.updateSync(entity);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });

  describe('#getLatestSync', () => {
    it('resolves without errors if id exists', async () => {
      createSync.mockResolvedValue(undefined);
      const entity = createFakeSync();

      const createPromise = syncManager.getLatestSync(entity.layerId);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if id not exists', async () => {
      const entity = createFakeSync();
      getLatestSync.mockRejectedValue(new SyncNotFoundError(`sync with layer id = ${entity.layerId} not found`));

      const createPromise = syncManager.getLatestSync(entity.layerId);

      await expect(createPromise).rejects.toThrow(SyncNotFoundError);
    });
  });
});
