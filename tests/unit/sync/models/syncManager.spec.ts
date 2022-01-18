import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { SyncManager } from '../../../../src/sync/models/syncManager';
import { createFakeRerun, createFakeSync } from '../../../helpers/helper';
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
  const findOneSyncWithReruns = jest.fn();

  const createRerun = jest.fn();
  const findOneRerun = jest.fn();
  const findReruns = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    const syncRepository = { getLatestSync, createSync, updateSync, findOneSync, findSyncs, findOneSyncWithReruns };
    const rerunRepository = { createRerun, findOneRerun, findReruns };
    syncManager = new SyncManager(syncRepository, rerunRepository, jsLogger({ enabled: false }));
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
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();
      const sync = createFakeSync({ isFull: false, isRerun: false, status: Status.FAILED });

      findOneRerun.mockResolvedValue(undefined);
      findOneSyncWithReruns.mockResolvedValue({ ...sync, reruns: [] });
      findOneSync.mockResolvedValue(undefined);
      const createRerunPromise = syncManager.rerunSync(sync.id, rerun.rerunId, rerunStartDate);

      const expectedRerun = { ...rerun, referenceId: sync.id, number: 1 };
      const expectedRerunAsSync = { ...sync, id: rerun.rerunId, isRerun: true, status: Status.IN_PROGRESS, startDate: rerunStartDate, endDate: null };

      await expect(createRerunPromise).resolves.not.toThrow();
      expect(createRerun).toHaveBeenCalledWith(expectedRerun, expectedRerunAsSync);
    });

    it('resolves without errors on a sync with a previous rerun', async () => {
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();
      const existingRerun = createFakeRerun();
      const existingRerunAsSync = createFakeSync({ id: existingRerun.rerunId, isFull: false, isRerun: true, status: Status.FAILED });
      const sync = createFakeSync({ isFull: false, isRerun: false, status: Status.FAILED });

      findOneRerun.mockResolvedValue(undefined);
      findOneSyncWithReruns.mockResolvedValue({ ...sync, reruns: [existingRerun] });
      findOneSync.mockResolvedValue(existingRerunAsSync);
      const createRerunPromise = syncManager.rerunSync(sync.id, rerun.rerunId, rerunStartDate);

      const expectedRerun = { ...rerun, referenceId: sync.id, number: existingRerun.number + 1 };
      const expectedRerunAsSync = { ...sync, id: rerun.rerunId, isRerun: true, status: Status.IN_PROGRESS, startDate: rerunStartDate, endDate: null };

      await expect(createRerunPromise).resolves.not.toThrow();
      expect(createRerun).toHaveBeenCalledWith(expectedRerun, expectedRerunAsSync);
    });

    it('resolves without errors on a sync with multiple previous reruns', async () => {
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();
      const existingRerun1 = createFakeRerun();
      const existingRerun2 = createFakeRerun();
      const latestRerun = existingRerun1.number > existingRerun2.number ? existingRerun1 : existingRerun2;
      const existingRerunAsSync = createFakeSync({ id: latestRerun.rerunId, isFull: false, isRerun: true, status: Status.FAILED });
      const sync = createFakeSync({ isFull: false, isRerun: false, status: Status.FAILED });

      findOneRerun.mockResolvedValue(undefined);
      findOneSyncWithReruns.mockResolvedValue({ ...sync, reruns: [existingRerun1, existingRerun2] });
      findOneSync.mockResolvedValue(existingRerunAsSync);
      const createRerunPromise = syncManager.rerunSync(sync.id, rerun.rerunId, rerunStartDate);

      const expectedRerun = { ...rerun, referenceId: sync.id, number: latestRerun.number + 1 };
      const expectedRerunAsSync = { ...sync, id: rerun.rerunId, isRerun: true, status: Status.IN_PROGRESS, startDate: rerunStartDate, endDate: null };

      await expect(createRerunPromise).resolves.not.toThrow();
      expect(createRerun).toHaveBeenCalledWith(expectedRerun, expectedRerunAsSync);
    });

    it('rejects if a rerun with the same id already exists in the db', async () => {
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();

      findOneRerun.mockResolvedValue(rerun);
      const createRerunPromise = syncManager.rerunSync(rerun.referenceId, rerun.rerunId, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(RerunAlreadyExistsError);
    });

    it('rejects if no sync was found with provided id', async () => {
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();

      findOneRerun.mockResolvedValue(undefined);
      findOneSyncWithReruns.mockResolvedValue(undefined);
      const createRerunPromise = syncManager.rerunSync(rerun.referenceId, rerun.rerunId, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(SyncNotFoundError);
    });

    it('rejects if the sync for rerun is full', async () => {
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();
      const sync = createFakeSync({ isFull: true, isRerun: false, status: Status.FAILED });

      findOneRerun.mockResolvedValue(undefined);
      findOneSyncWithReruns.mockResolvedValue(sync);
      const createRerunPromise = syncManager.rerunSync(rerun.referenceId, rerun.rerunId, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(InvalidSyncForRerunError);
    });

    it('rejects if the sync for rerun is a rerun', async () => {
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();
      const sync = createFakeSync({ isFull: false, isRerun: true, status: Status.FAILED });

      findOneRerun.mockResolvedValue(undefined);
      findOneSyncWithReruns.mockResolvedValue(sync);
      const createRerunPromise = syncManager.rerunSync(rerun.referenceId, rerun.rerunId, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(InvalidSyncForRerunError);
    });

    it('rejects if the sync for rerun does not have failed status', async () => {
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();
      const sync = createFakeSync({ isFull: false, isRerun: false, status: Status.IN_PROGRESS });

      findOneRerun.mockResolvedValue(undefined);
      findOneSyncWithReruns.mockResolvedValue(sync);
      const createRerunPromise = syncManager.rerunSync(rerun.referenceId, rerun.rerunId, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(InvalidSyncForRerunError);
    });

    it('rejects if the sync for rerun already has a rerun which is in progress', async () => {
      const rerun = createFakeRerun();
      const rerunStartDate = faker.datatype.datetime();
      const existingRerun = createFakeRerun();
      const existingRerunAsSync = createFakeSync({ id: existingRerun.rerunId, isFull: false, isRerun: true, status: Status.IN_PROGRESS });
      const sync = createFakeSync({ isFull: false, isRerun: false, status: Status.FAILED });

      findOneRerun.mockResolvedValue(undefined);
      findOneSyncWithReruns.mockResolvedValue({ ...sync, reruns: [existingRerun] });
      findOneSync.mockResolvedValue(existingRerunAsSync);
      const createRerunPromise = syncManager.rerunSync(rerun.referenceId, rerun.rerunId, rerunStartDate);

      await expect(createRerunPromise).rejects.toThrow(InvalidSyncForRerunError);
    });
  });
});
