import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { SyncManager } from '../../../../src/sync/models/syncManager';
import { createFakeRerunSync, createFakeSync } from '../../../helpers/helper';
import {
  FullSyncAlreadyExistsError,
  InvalidSyncForRerunError,
  RerunAlreadyExistsError,
  SyncAlreadyExistsError,
  SyncNotFoundError,
} from '../../../../src/sync/models/errors';
import { GeometryType, Status } from '../../../../src/common/enums';

let syncManager: SyncManager;

describe('SyncManager', () => {
  const createSync = jest.fn();
  const getLatestSync = jest.fn();
  const updateSync = jest.fn();
  const findOneSync = jest.fn();
  const findSyncs = jest.fn();
  const findOneSyncWithLastRerun = jest.fn();
  const createRerun = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    const syncRepository = { getLatestSync, createSync, updateSync, findOneSync, findSyncs, findOneSyncWithLastRerun, createRerun };
    syncManager = new SyncManager(syncRepository, jsLogger({ enabled: false }), { get: jest.fn(), has: jest.fn() });
  });

  describe('#createSync', () => {
    it('resolves without errors if syncId is not already in use by the db', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(undefined);
      createSync.mockResolvedValue(undefined);
      findSyncs.mockResolvedValue([]);

      const createPromise = syncManager.createSync(sync);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('resolves without errors if sync is full and a full sync with the same parameters does not exist already in the db', async () => {
      const fullSync = createFakeSync({ isFull: true });

      findOneSync.mockResolvedValue(undefined);
      createSync.mockResolvedValue(undefined);
      findSyncs.mockResolvedValue([]);

      const createPromise = syncManager.createSync(fullSync);

      await expect(createPromise).resolves.not.toThrow();
      expect(findSyncs).toHaveBeenCalled();
    });

    it('resolves without errors if sync is not full and does not check for already existing syncs with the same parameters in the db', async () => {
      const nonFullSync = createFakeSync({ isFull: false });

      findOneSync.mockResolvedValue(undefined);
      createSync.mockResolvedValue(undefined);

      const createPromise = syncManager.createSync(nonFullSync);

      await expect(createPromise).resolves.not.toThrow();
      expect(findSyncs).not.toHaveBeenCalled();
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
      findSyncs.mockResolvedValue([alreadyExistsFullSync]);
      const createPromise = syncManager.createSync(fullSync);

      await expect(createPromise).rejects.toThrow(FullSyncAlreadyExistsError);
      expect(findSyncs).toHaveBeenCalled();
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
      expect(findSyncs).not.toHaveBeenCalled();
    });

    it('resolves without errors for a full sync that did not update its layer or geometry', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(sync.id, sync);

      await expect(updatePromise).resolves.not.toThrow();
      expect(findSyncs).not.toHaveBeenCalled();
    });

    it('resolves without errors for a full sync that updated its layerId if full was not found with updated parameters', async () => {
      const sync = createFakeSync({ isFull: true });
      const updatedSync = createFakeSync({ ...sync, layerId: sync.layerId + 1 });

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(sync.id, updatedSync);

      await expect(updatePromise).resolves.not.toThrow();
    });

    it('resolves without errors for a full sync that updated its geometryType if full was not found with updated parameters', async () => {
      const sync = createFakeSync({ isFull: true, geometryType: GeometryType.POINT });
      const updatedSync = createFakeSync({ ...sync, geometryType: GeometryType.POLYGON });

      findOneSync.mockResolvedValue(sync);
      updateSync.mockResolvedValue(undefined);

      const updatePromise = syncManager.updateSync(sync.id, updatedSync);

      await expect(updatePromise).resolves.not.toThrow();
    });

    it('rejects if the sync does not exists in the db', async () => {
      const sync = createFakeSync();

      findOneSync.mockResolvedValue(undefined);
      const updatePromise = syncManager.updateSync(sync.id, sync);

      await expect(updatePromise).rejects.toThrow(SyncNotFoundError);
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

  describe('#rerunSync', () => {
    it('resolves without errors on a sync with no previous reruns', async () => {
      const rerunId = faker.datatype.uuid();
      const rerunStartDate = faker.datatype.datetime();
      const sync = createFakeSync({ status: Status.FAILED });

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue({ ...sync, reruns: [] });
      const createRerunPromise = syncManager.rerunSyncIfNeeded(sync.id, rerunId, rerunStartDate);

      const expectedRerunForCreation = {
        ...sync,
        id: rerunId,
        baseSyncId: sync.id,
        runNumber: 1,
        status: Status.IN_PROGRESS,
        startDate: rerunStartDate,
        endDate: null,
      };

      await expect(createRerunPromise).resolves.not.toThrow();
      expect(createRerun).toHaveBeenCalledWith(expectedRerunForCreation, undefined);
    });

    it('resolves if the sync for rerun is full', async () => {
      const rerunId = faker.datatype.uuid();
      const rerunStartDate = faker.datatype.datetime();
      const sync = createFakeSync({ isFull: true, runNumber: 0, status: Status.FAILED });

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue({ ...sync, reruns: [] });
      createRerun.mockResolvedValue(true);
      const createRerunPromise = syncManager.rerunSyncIfNeeded(sync.id, rerunId, rerunStartDate);

      const expectedRerunForCreation = {
        ...sync,
        id: rerunId,
        baseSyncId: sync.id,
        runNumber: 1,
        status: Status.IN_PROGRESS,
        startDate: rerunStartDate,
        endDate: null,
      };

      await expect(createRerunPromise).resolves.toBe(true);
      expect(createRerun).toHaveBeenCalledWith(expectedRerunForCreation, undefined);
    });

    it('resolves with false if the sync has completed and does not need a rerun', async () => {
      const rerunId = faker.datatype.uuid();
      const rerunStartDate = faker.datatype.datetime();
      const sync = createFakeSync({ isFull: true, runNumber: 0, status: Status.FAILED });

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue({ ...sync, reruns: [] });
      createRerun.mockResolvedValue(false);
      const createRerunPromise = syncManager.rerunSyncIfNeeded(sync.id, rerunId, rerunStartDate);

      const expectedRerunForCreation = {
        ...sync,
        id: rerunId,
        baseSyncId: sync.id,
        runNumber: 1,
        status: Status.IN_PROGRESS,
        startDate: rerunStartDate,
        endDate: null,
      };

      await expect(createRerunPromise).resolves.toBe(false);
      expect(createRerun).toHaveBeenCalledWith(expectedRerunForCreation, undefined);
    });

    it('resolves without errors on a sync with a previous failed rerun', async () => {
      const sync = createFakeSync({ status: Status.FAILED });
      const rerun = createFakeRerunSync({ baseSyncId: sync.id, status: Status.FAILED });
      const rerunStartDate = faker.datatype.datetime();

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue({ ...sync, reruns: [rerun] });
      const createRerunPromise = syncManager.rerunSyncIfNeeded(sync.id, rerun.id, rerunStartDate);

      const expectedRerunForCreation = {
        ...sync,
        id: rerun.id,
        baseSyncId: sync.id,
        runNumber: rerun.runNumber + 1,
        status: Status.IN_PROGRESS,
        startDate: rerunStartDate,
        endDate: null,
      };

      await expect(createRerunPromise).resolves.not.toThrow();
      expect(createRerun).toHaveBeenCalledWith(expectedRerunForCreation, undefined);
    });

    it('resolves without errors on a sync with multiple previous failed reruns', async () => {
      const sync = createFakeSync({ status: Status.FAILED });
      const rerun = createFakeRerunSync({ baseSyncId: sync.id });
      const rerunStartDate = faker.datatype.datetime();
      const existingRerun2 = createFakeRerunSync({ baseSyncId: sync.id, status: Status.FAILED, runNumber: 2 });

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue({ ...sync, reruns: [existingRerun2] });
      const createRerunPromise = syncManager.rerunSyncIfNeeded(sync.id, rerun.id, rerunStartDate);

      const expectedRerunForCreation = {
        ...sync,
        id: rerun.id,
        baseSyncId: sync.id,
        runNumber: 3,
        status: Status.IN_PROGRESS,
        startDate: rerunStartDate,
        endDate: null,
      };

      await expect(createRerunPromise).resolves.not.toThrow();
      expect(createRerun).toHaveBeenCalledWith(expectedRerunForCreation, undefined);
    });

    it('rejects if a rerun with the same id already exists in the db', async () => {
      const rerun = createFakeRerunSync();
      const rerunStartDate = faker.datatype.datetime();

      findOneSync.mockResolvedValue(rerun);
      const createRerunPromise = syncManager.rerunSyncIfNeeded(rerun.baseSyncId as string, rerun.id, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(RerunAlreadyExistsError);
    });

    it('rejects if no sync was found with provided id', async () => {
      const rerun = createFakeRerunSync();
      const rerunStartDate = faker.datatype.datetime();

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue(undefined);
      const createRerunPromise = syncManager.rerunSyncIfNeeded(rerun.baseSyncId as string, rerun.id, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(SyncNotFoundError);
    });

    it('rejects if the sync for rerun is a rerun', async () => {
      const sync = createFakeSync({ runNumber: 1, status: Status.FAILED });
      const rerun = createFakeRerunSync({ baseSyncId: sync.id });
      const rerunStartDate = faker.datatype.datetime();

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue({ ...sync, reruns: [] });
      const createRerunPromise = syncManager.rerunSyncIfNeeded(sync.id, rerun.id, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(InvalidSyncForRerunError);
    });

    it('rejects if the sync for rerun does not have failed status', async () => {
      const sync = createFakeSync({ runNumber: 0, status: Status.IN_PROGRESS });
      const rerun = createFakeRerunSync({ baseSyncId: sync.id });
      const rerunStartDate = faker.datatype.datetime();

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue(sync);
      const createRerunPromise = syncManager.rerunSyncIfNeeded(sync.id, rerun.id, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(InvalidSyncForRerunError);
    });

    it('rejects if the sync for rerun already has a rerun which is in progress', async () => {
      const sync = createFakeSync({ status: Status.FAILED });
      const existingRerun = createFakeRerunSync({ baseSyncId: sync.id });
      const rerunId = faker.datatype.uuid();
      const rerunStartDate = faker.datatype.datetime();

      findOneSync.mockResolvedValue(undefined);
      findOneSyncWithLastRerun.mockResolvedValue({ ...sync, reruns: [existingRerun] });
      const createRerunPromise = syncManager.rerunSyncIfNeeded(sync.id, rerunId, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(InvalidSyncForRerunError);
    });
  });
});
