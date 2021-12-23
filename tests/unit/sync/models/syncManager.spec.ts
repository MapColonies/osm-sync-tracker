import jsLogger from '@map-colonies/js-logger';
import { SyncManager } from '../../../../src/sync/models/syncManager';
import { createFakeSync } from '../../../helpers/helper';
import { FullSyncAlreadyExistsError, SyncAlreadyExistsError, SyncNotFoundError } from '../../../../src/sync/models/errors';
import { GeometryType } from '../../../../src/common/enums';

let syncManager: SyncManager;

describe('SyncManager', () => {
  let createSync: jest.Mock;
  let getLatestSync: jest.Mock;
  let updateSync: jest.Mock;
  let findOneSync: jest.Mock;
  let findFullSyncByLayerAndGeometry: jest.Mock;

  beforeEach(() => {
    getLatestSync = jest.fn();
    createSync = jest.fn();
    updateSync = jest.fn();
    findOneSync = jest.fn();
    findFullSyncByLayerAndGeometry = jest.fn();

    const repository = { getLatestSync, createSync, updateSync, findOneSync, findFullSyncByLayerAndGeometry };
    syncManager = new SyncManager(repository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createSync', () => {
    it('resolves without errors if syncId is not already in use by the db', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(undefined);
      createSync.mockResolvedValue(undefined);
      findFullSyncByLayerAndGeometry.mockResolvedValue(undefined);

      const createPromise = syncManager.createSync(sync);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('resolves without errors if sync is full and a full sync with the same parameters does not exist already in the db', async () => {
      const fullSync = createFakeSync({ isFull: true });

      findOneSync.mockResolvedValue(undefined);
      createSync.mockResolvedValue(undefined);
      findFullSyncByLayerAndGeometry.mockResolvedValue(undefined);

      const createPromise = syncManager.createSync(fullSync);

      await expect(createPromise).resolves.not.toThrow();
      expect(findFullSyncByLayerAndGeometry).toHaveBeenCalled();
    });

    it('resolves without errors if sync is not full and does not check for already existing syncs with the same parameters in the db', async () => {
      const nonFullSync = createFakeSync({ isFull: false });

      findOneSync.mockResolvedValue(undefined);
      createSync.mockResolvedValue(undefined);

      const createPromise = syncManager.createSync(nonFullSync);

      await expect(createPromise).resolves.not.toThrow();
      expect(findFullSyncByLayerAndGeometry).not.toHaveBeenCalled();
    });

    it('rejects if syncId already in use by the db', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      const createPromise = syncManager.createSync(sync);

      await expect(createPromise).rejects.toThrow(SyncAlreadyExistsError);
    });

    it('rejects if a full sync with the same layerId and geometryType already exists in the db', async () => {
      const fullSync = createFakeSync({ isFull: true });
      const { layerId, geometryType } = fullSync;
      const alreadyExistsFullSync = createFakeSync({ isFull: true, layerId, geometryType });

      findOneSync.mockResolvedValue(undefined);
      findFullSyncByLayerAndGeometry.mockResolvedValue(alreadyExistsFullSync);
      const createPromise = syncManager.createSync(fullSync);

      await expect(createPromise).rejects.toThrow(FullSyncAlreadyExistsError);
      expect(findFullSyncByLayerAndGeometry).toHaveBeenCalled();
    });
  });

  describe('#updateSync', () => {
    it('resolves without errors if the sync is exists in the db', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(sync.id, sync);

      await expect(updatePromise).resolves.not.toThrow();
    });

    it('resolves without errors for a non full sync and not to check for syncs with same parameters in the db', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(sync.id, sync);

      await expect(updatePromise).resolves.not.toThrow();
      expect(findFullSyncByLayerAndGeometry).not.toHaveBeenCalled();
    });

    it('resolves without errors for a full sync that did not update its layer or geometry', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(sync.id, sync);

      await expect(updatePromise).resolves.not.toThrow();
      expect(findFullSyncByLayerAndGeometry).not.toHaveBeenCalled();
    });

    it('resolves without errors for a full sync that updated its layerId if full was not found with updated parameters', async () => {
      const sync = createFakeSync({ isFull: true });
      const updatedSync = createFakeSync({ ...sync, layerId: sync.layerId + 1 });

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);
      findFullSyncByLayerAndGeometry.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(sync.id, updatedSync);

      await expect(updatePromise).resolves.not.toThrow();
      expect(findFullSyncByLayerAndGeometry).toHaveBeenCalled();
    });

    it('resolves without errors for a full sync that updated its geometryType if full was not found with updated parameters', async () => {
      const sync = createFakeSync({ isFull: true, geometryType: GeometryType.POINT });
      const updatedSync = createFakeSync({ ...sync, geometryType: GeometryType.POLYGON });

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);
      findFullSyncByLayerAndGeometry.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(sync.id, updatedSync);

      await expect(updatePromise).resolves.not.toThrow();
      expect(findFullSyncByLayerAndGeometry).toHaveBeenCalled();
    });

    it('rejects if the sync does not exists in the db', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(undefined);
      const updatePromise = syncManager.updateSync(sync.id, sync);

      await expect(updatePromise).rejects.toThrow(SyncNotFoundError);
    });

    it('rejects if the updated sync is full while an already full sync exist with the same parameters in the db', async () => {
      const sync = createFakeSync({ isFull: true, geometryType: GeometryType.POINT });
      const updatedSync = createFakeSync({ ...sync, geometryType: GeometryType.POLYGON });
      const alreadyExistingFull = createFakeSync({ isFull: true, layerId: updatedSync.layerId, geometryType: updatedSync.geometryType });

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);
      findFullSyncByLayerAndGeometry.mockResolvedValue(alreadyExistingFull);

      const updatePromise = syncManager.updateSync(sync.id, updatedSync);

      await expect(updatePromise).rejects.toThrow(FullSyncAlreadyExistsError);
      expect(findFullSyncByLayerAndGeometry).toHaveBeenCalled();
    });
  });

  describe('#getLatestSync', () => {
    it('resolves without errors if the sync exists in the db', async () => {
      const sync = createFakeSync();

      getLatestSync.mockResolvedValue(sync);

      const getLatestPromise = syncManager.getLatestSync(sync.layerId, sync.geometryType);

      await expect(getLatestPromise).resolves.not.toThrow();
    });

    it('rejects if the sync does not exist in the db', async () => {
      const sync = createFakeSync();

      getLatestSync.mockResolvedValue(undefined);
      const getLatestPromise = syncManager.getLatestSync(sync.layerId, sync.geometryType);

      await expect(getLatestPromise).rejects.toThrow(SyncNotFoundError);
    });
  });
});
