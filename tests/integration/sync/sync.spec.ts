import httpStatus, { StatusCodes } from 'http-status-codes';
import { DependencyContainer } from 'tsyringe';
import { faker } from '@faker-js/faker';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { EntityRepository, ENTITY_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/entity/DAL/entityRepository';
import { getApp } from '../../../src/app';
import { BEFORE_ALL_TIMEOUT, RERUN_TEST_TIMEOUT, getBaseRegisterOptions, DEFAULT_ISOLATION_LEVEL, LONG_RUNNING_TEST_TIMEOUT } from '../helpers';
import { SYNC_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/sync/DAL/syncRepository';
import { FILE_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/file/DAL/fileRepository';
import { EntityStatus, GeometryType, Status } from '../../../src/common/enums';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { FileRequestSender } from '../file/helpers/requestSender';
import { generateUniqueNumber } from '../../helpers/helper';
import { TransactionFailureError } from '../../../src/changeset/models/errors';
import { SERVICES } from '../../../src/common/constants';
import { IApplication } from '../../../src/common/interfaces';
import { EntityHistory } from '../../../src/entity/DAL/entityHistory';
import { EntityRequestSender } from '../entity/helpers/requestSender';
import { ChangesetRequestSender } from '../changeset/helpers/requestSender';
import { createStringifiedFakeEntity } from '../entity/helpers/generators';
import { createStringifiedFakeChangeset } from '../changeset/helpers/generators';
import { createStringifiedFakeRerunCreateBody, createStringifiedFakeSync } from './helpers/generators';
import { SyncRequestSender } from './helpers/requestSender';

describe('sync', function () {
  let syncRequestSender: SyncRequestSender;
  let fileRequestSender: FileRequestSender;
  let entityRequestSender: EntityRequestSender;
  let changesetRequestSender: ChangesetRequestSender;
  let mockSyncRequestSender: SyncRequestSender;
  let entityRepository: EntityRepository;
  let entityHistoryRepository: Repository<EntityHistory>;

  let depContainer: DependencyContainer;

  beforeAll(async function () {
    const { app, container } = await getApp(getBaseRegisterOptions());
    depContainer = container;
    syncRequestSender = new SyncRequestSender(app);
    fileRequestSender = new FileRequestSender(app);
    entityRequestSender = new EntityRequestSender(app);
    changesetRequestSender = new ChangesetRequestSender(app);
    entityRepository = depContainer.resolve<EntityRepository>(ENTITY_CUSTOM_REPOSITORY_SYMBOL);
    const connection = depContainer.resolve(DataSource);
    entityHistoryRepository = connection.getRepository(EntityHistory);
  }, BEFORE_ALL_TIMEOUT);

  afterAll(async function () {
    const connection = depContainer.resolve(DataSource);
    await connection.destroy();
    depContainer.reset();
  });

  describe('Happy Path', function () {
    describe('POST /sync', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeSync();
        const response = await syncRequestSender.postSync(body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });

      it('should return 201 status code for a post with metadata', async function () {
        const metadata = { test: 'test' };
        const sync = createStringifiedFakeSync();
        const response = await syncRequestSender.postSync({ ...sync, metadata });

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
        const latestResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);
        expect(latestResponse.body).toHaveProperty('metadata', metadata);
      });

      it('should return 201 status code for non full sync with the same layerId and geometryType as existing non full sync', async function () {
        const nonFullSync1 = createStringifiedFakeSync({ isFull: false });
        const { layerId, geometryType } = nonFullSync1;

        const nonFullSync2 = createStringifiedFakeSync({ isFull: false, layerId, geometryType });

        const response = await syncRequestSender.postSync(nonFullSync2);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });

    describe('PATCH /sync', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeSync();
        expect(await syncRequestSender.postSync(body)).toHaveStatus(StatusCodes.CREATED);
        const { id, isFull, ...updateBody } = body;

        const response = await syncRequestSender.patchSync(id as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });

      it('should return 200 status code and update the sync metadata accordingly', async function () {
        // create without metadata
        const sync = createStringifiedFakeSync();
        const response = await syncRequestSender.postSync(sync);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
        let latestResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);
        expect(latestResponse.body).toHaveProperty('metadata', null);

        // update with some metadata
        await syncRequestSender.patchSync(sync.id as string, { metadata: { test: 'test' } });
        latestResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);
        expect(latestResponse.body).toHaveProperty('metadata', { test: 'test' });

        // update with additional metadata
        await syncRequestSender.patchSync(sync.id as string, { metadata: { test2: 'test2' } });
        latestResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);
        expect(latestResponse.body).toHaveProperty('metadata', { test: 'test', test2: 'test2' });
      });
    });

    describe('GET /sync', function () {
      it('should return 200 status code and the filtered syncs by status, layerId and geometry type', async function () {
        const layerId = generateUniqueNumber();
        const inprogressSync = createStringifiedFakeSync({ status: Status.IN_PROGRESS, geometryType: GeometryType.POLYGON, layerId, isFull: false });
        expect(await syncRequestSender.postSync(inprogressSync)).toHaveStatus(StatusCodes.CREATED);

        const anotherInprogressSync = createStringifiedFakeSync({
          status: Status.IN_PROGRESS,
          geometryType: GeometryType.LINESTRING,
          layerId,
          isFull: false,
        });
        expect(await syncRequestSender.postSync(anotherInprogressSync)).toHaveStatus(StatusCodes.CREATED);

        const completedSync = createStringifiedFakeSync({
          status: Status.COMPLETED,
          geometryType: GeometryType.POLYGON,
          layerId,
          isFull: false,
        });
        expect(await syncRequestSender.postSync(completedSync)).toHaveStatus(StatusCodes.CREATED);

        const differentGeometryTypeSync = createStringifiedFakeSync({
          status: Status.IN_PROGRESS,
          geometryType: GeometryType.POINT,
          layerId,
          isFull: false,
        });
        expect(await syncRequestSender.postSync(differentGeometryTypeSync)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getSyncs({
          status: [Status.IN_PROGRESS],
          geometryType: [GeometryType.POLYGON, GeometryType.LINESTRING],
          layerId: [layerId],
        });

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toHaveLength(2);
        expect(response).toHaveProperty(
          'body',
          expect.arrayContaining([
            { ...inprogressSync, baseSyncId: null, endDate: null, runNumber: 0, metadata: null },
            { ...anotherInprogressSync, baseSyncId: null, endDate: null, runNumber: 0, metadata: null },
          ])
        );
      });

      it('should return 200 status code and the filtered syncs by isFull, layerId and status', async function () {
        const layerId = generateUniqueNumber();
        const sync1 = createStringifiedFakeSync({ status: Status.COMPLETED, isFull: false, geometryType: GeometryType.POLYGON, layerId });
        expect(await syncRequestSender.postSync(sync1)).toHaveStatus(StatusCodes.CREATED);

        const sync2 = createStringifiedFakeSync({ status: Status.IN_PROGRESS, isFull: false, geometryType: GeometryType.LINESTRING, layerId });
        expect(await syncRequestSender.postSync(sync2)).toHaveStatus(StatusCodes.CREATED);

        const sync3 = createStringifiedFakeSync({ status: Status.COMPLETED, isFull: false, geometryType: GeometryType.LINESTRING, layerId });
        expect(await syncRequestSender.postSync(sync3)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getSyncs({ status: [Status.COMPLETED], isFull: false, layerId: [layerId] });

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toHaveLength(2);
        expect(response).toHaveProperty(
          'body',
          expect.arrayContaining([
            { ...sync1, baseSyncId: null, endDate: null, runNumber: 0, metadata: null },
            { ...sync3, baseSyncId: null, endDate: null, runNumber: 0, metadata: null },
          ])
        );
      });

      it('should return 200 status code and the filtered syncs by isRerun, layerId and geometryType', async function () {
        const layerId = generateUniqueNumber();
        // create the base sync
        const sync1 = createStringifiedFakeSync({ layerId, isFull: false });
        expect(await syncRequestSender.postSync(sync1)).toHaveStatus(StatusCodes.CREATED);
        const { id: baseSyncId } = sync1;

        // mark the base sync as failure and rerun
        expect(await syncRequestSender.patchSync(baseSyncId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
        const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
        const { rerunId, startDate } = rerunCreateBody;
        expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody)).toHaveStatus(httpStatus.CREATED);

        const sync2 = createStringifiedFakeSync({ layerId, geometryType: GeometryType.POLYGON, isFull: false });
        expect(await syncRequestSender.postSync(sync2)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getSyncs({ isRerun: true, geometryType: [GeometryType.POLYGON], layerId: [layerId] });

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toHaveLength(1);
        expect(response).toHaveProperty(
          'body',
          expect.arrayContaining([
            { ...sync1, id: rerunId, baseSyncId: sync1.id as string, startDate: startDate as string, endDate: null, runNumber: 1, metadata: {} },
          ])
        );
      });

      it(
        'should return 200 status code and the filtered syncs by isRerun, isFull, layerId and status',
        async function () {
          const layerId = generateUniqueNumber();
          // create failed full rerun
          const fullSync = createStringifiedFakeSync({ isFull: true, layerId });
          expect(await syncRequestSender.postSync(fullSync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(fullSync.id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const fullRerunCreateBody1 = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          expect(await syncRequestSender.rerunSync(fullSync.id as string, fullRerunCreateBody1)).toHaveStatus(httpStatus.CREATED);
          expect(await syncRequestSender.patchSync(fullRerunCreateBody1.rerunId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          // create another rerun with the same base sync
          const fullRerunCreateBody2 = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          expect(await syncRequestSender.rerunSync(fullSync.id as string, fullRerunCreateBody2)).toHaveStatus(httpStatus.CREATED);
          expect(await syncRequestSender.patchSync(fullRerunCreateBody2.rerunId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          // create another but inprogress
          const fullRerunCreateBody3 = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          expect(await syncRequestSender.rerunSync(fullSync.id as string, fullRerunCreateBody3)).toHaveStatus(httpStatus.CREATED);

          // create failed rerun but not full
          const diffSync = createStringifiedFakeSync({ isFull: false, layerId });
          expect(await syncRequestSender.postSync(diffSync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(diffSync.id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const diffRerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          expect(await syncRequestSender.rerunSync(diffSync.id as string, diffRerunCreateBody)).toHaveStatus(httpStatus.CREATED);
          expect(await syncRequestSender.patchSync(diffRerunCreateBody.rerunId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          // create failed full sync but not rerun
          const fullSync2 = createStringifiedFakeSync({ isFull: true, status: Status.FAILED, layerId: layerId + 1 });
          expect(await syncRequestSender.postSync(fullSync2)).toHaveStatus(StatusCodes.CREATED);

          const response = await syncRequestSender.getSyncs({
            isRerun: true,
            isFull: true,
            status: [Status.FAILED],
            layerId: [layerId, layerId + 1],
          });

          expect(response.status).toBe(httpStatus.OK);
          expect(response.body).toHaveLength(2);
          expect(response).toHaveProperty(
            'body',
            expect.arrayContaining([
              {
                ...fullSync,
                id: fullRerunCreateBody1.rerunId,
                baseSyncId: fullSync.id as string,
                startDate: fullRerunCreateBody1.startDate as string,
                endDate: null,
                runNumber: 1,
                status: Status.FAILED,
                metadata: {},
              },
              {
                ...fullSync,
                id: fullRerunCreateBody2.rerunId,
                baseSyncId: fullSync.id as string,
                startDate: fullRerunCreateBody2.startDate as string,
                endDate: null,
                runNumber: 2,
                status: Status.FAILED,
                metadata: {},
              },
            ])
          );
        },
        LONG_RUNNING_TEST_TIMEOUT
      );

      it('should return 200 status code and the filtered syncs by isRerun, isFull, geometryType, status and layerId', async function () {
        const layerId1 = generateUniqueNumber();
        const layerId2 = generateUniqueNumber();

        // valid
        const sync0 = createStringifiedFakeSync({ isFull: false, geometryType: GeometryType.POLYGON, status: Status.COMPLETED, layerId: layerId1 });
        // another layerId
        const sync1 = createStringifiedFakeSync({
          isFull: false,
          geometryType: GeometryType.LINESTRING,
          status: Status.COMPLETED,
          layerId: layerId2,
        });
        // bad layerId
        const sync2 = createStringifiedFakeSync({
          isFull: false,
          geometryType: GeometryType.POLYGON,
          status: Status.COMPLETED,
          layerId: layerId1 + 1,
        });
        // bad isFull
        const sync3 = createStringifiedFakeSync({ isFull: true, geometryType: GeometryType.POLYGON, status: Status.COMPLETED, layerId: layerId1 });
        // another geometryType
        const sync4 = createStringifiedFakeSync({
          isFull: false,
          geometryType: GeometryType.LINESTRING,
          status: Status.COMPLETED,
          layerId: layerId1,
        });
        // bad status
        const sync5 = createStringifiedFakeSync({ isFull: false, geometryType: GeometryType.POLYGON, status: Status.IN_PROGRESS, layerId: layerId1 });
        // another status
        const sync6 = createStringifiedFakeSync({ isFull: false, geometryType: GeometryType.POLYGON, status: Status.FAILED, layerId: layerId1 });
        // bad geometryType
        const sync7 = createStringifiedFakeSync({ isFull: false, geometryType: GeometryType.POINT, status: Status.COMPLETED, layerId: layerId1 });

        expect(await syncRequestSender.postSync(sync0)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(sync1)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(sync2)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(sync3)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(sync4)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(sync5)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(sync6)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(sync7)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getSyncs({
          isRerun: false,
          isFull: false,
          status: [Status.COMPLETED, Status.FAILED],
          geometryType: [GeometryType.POLYGON, GeometryType.LINESTRING],
          layerId: [layerId1, layerId2],
        });

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toHaveLength(4);
        expect(response).toHaveProperty(
          'body',
          expect.arrayContaining([
            { ...sync0, endDate: null, baseSyncId: null, runNumber: 0, metadata: null },
            { ...sync1, endDate: null, baseSyncId: null, runNumber: 0, metadata: null },
            { ...sync4, endDate: null, baseSyncId: null, runNumber: 0, metadata: null },
            { ...sync6, endDate: null, baseSyncId: null, runNumber: 0, metadata: null },
          ])
        );
      });
    });

    describe('GET /sync/latest', function () {
      it('should return 200 status code and the latest sync entity', async function () {
        const earlierDate = faker.date.past().toISOString();
        const earlierSync = createStringifiedFakeSync({ dumpDate: earlierDate, geometryType: GeometryType.POLYGON, isFull: false });
        const { layerId, geometryType } = earlierSync;

        const laterSync = createStringifiedFakeSync({
          dumpDate: faker.date.between(earlierDate, new Date()).toISOString(),
          layerId,
          geometryType,
          isFull: false,
        });
        const differentGeometryTypeSync = createStringifiedFakeSync({
          dumpDate: earlierDate,
          layerId,
          geometryType: GeometryType.POINT,
          isFull: false,
        });

        expect(await syncRequestSender.postSync(earlierSync)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(laterSync)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(differentGeometryTypeSync)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getLatestSync(layerId as number, geometryType as GeometryType);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject(laterSync);
      });

      it('should return 200 status code and the sync with the later startDate for multiple syncs with same dumpDate', async function () {
        const dumpDate = faker.date.past().toISOString();
        const startDate = faker.date.past().toISOString();

        const earlierStartDateSync = createStringifiedFakeSync({ dumpDate, startDate, geometryType: GeometryType.POLYGON, isFull: false });
        const { layerId, geometryType } = earlierStartDateSync;

        const laterStartDateSync = createStringifiedFakeSync({
          dumpDate,
          startDate: faker.date.between(startDate, new Date()).toISOString(),
          layerId,
          geometryType,
          isFull: false,
        });

        expect(await syncRequestSender.postSync(earlierStartDateSync)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(laterStartDateSync)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getLatestSync(layerId as number, geometryType as GeometryType);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject(laterStartDateSync);
      });

      it('should return 200 status code and the sync with the latest dumpDate that is not a FixDiff sync', async function () {
        const dumpDate = faker.date.past().toISOString();

        const earlierDumpDateSync = createStringifiedFakeSync({ dumpDate, geometryType: GeometryType.POLYGON, isFull: false });
        const { layerId, geometryType } = earlierDumpDateSync;

        const laterDumpDateFixDiffSync = createStringifiedFakeSync({
          dumpDate: faker.date.between(dumpDate, new Date()).toISOString(),
          layerId,
          geometryType,
          isFull: false,
        });
        const metadata = { isFixDiff: 'true' };

        expect(await syncRequestSender.postSync(earlierDumpDateSync)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync({ ...laterDumpDateFixDiffSync, metadata })).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getLatestSync(layerId as number, geometryType as GeometryType);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject(earlierDumpDateSync);
      });

      it(
        'should return 200 status code and the latest sync even if it has a rerun',
        async function () {
          const sync = createStringifiedFakeSync();
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          const response = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

          expect(response.status).toBe(StatusCodes.OK);
          expect(response.body).toMatchObject({ ...sync, status: Status.FAILED });

          // validate entity history count
          const entityHistoryCount = await entityHistoryRepository.countBy({ syncId: id });
          expect(entityHistoryCount).toBe(0);
        },
        RERUN_TEST_TIMEOUT
      );
    });

    describe('POST /sync/:syncId/rerun', function () {
      it(
        'should return 201 if the sync to rerun is a full failed sync',
        async function () {
          const sync = createStringifiedFakeSync({
            isFull: true,
          });
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          const response = await syncRequestSender.rerunSync(id as string, rerunCreateBody);

          expect(response).toHaveProperty('status', StatusCodes.CREATED);

          // validate entity history count
          const entityHistoryCount = await entityHistoryRepository.countBy({ syncId: id });
          expect(entityHistoryCount).toBe(0);
        },
        RERUN_TEST_TIMEOUT
      );

      //should return 200 if the sync to rerun was successfully closed by trying to rerun
      it(
        'should return 200 if the sync to rerun was successfully closed by trying to rerun',
        async function () {
          const sync = createStringifiedFakeSync({
            isFull: true,
            totalFiles: 1,
          });
          const { id } = sync;

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

          const file1 = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(id as string, file1)).toHaveStatus(StatusCodes.CREATED);

          const changeset1 = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);

          const file1Entity = [createStringifiedFakeEntity({ status: EntityStatus.COMPLETED, changesetId: changeset1.changesetId })];
          expect(await entityRequestSender.postEntityBulk(file1.fileId as string, file1Entity)).toHaveStatus(StatusCodes.CREATED);
          expect(await changesetRequestSender.putChangesets([changeset1.changesetId as string])).toHaveStatus(StatusCodes.OK);

          // file2 will be empty thus deleted on rerun action
          const file2 = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(id as string, file2)).toHaveStatus(StatusCodes.CREATED);

          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const response = await syncRequestSender.rerunSync(id as string, rerunCreateBody);

          expect(response).toHaveProperty('status', StatusCodes.OK);

          const fetchedEntity = await entityRepository.findOneBy({ entityId: file1Entity[0].entityId });
          expect(fetchedEntity).toMatchObject({ ...file1Entity[0], status: EntityStatus.COMPLETED, fileId: file1.fileId, failReason: null });

          // validate entity history count
          const entityHistoryCount = await entityHistoryRepository.countBy({ syncId: id });
          expect(entityHistoryCount).toBe(0);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should complete a sync on the first rerun',
        async function () {
          // create the base sync
          const baseSync = createStringifiedFakeSync({ isFull: false, totalFiles: 2 });
          expect(await syncRequestSender.postSync(baseSync)).toHaveStatus(StatusCodes.CREATED);
          const { id: baseSyncId } = baseSync;

          // create file and changeset
          const file1 = createStringifiedFakeFile({ totalEntities: 2 });
          expect(await fileRequestSender.postFile(baseSyncId as string, file1)).toHaveStatus(StatusCodes.CREATED);
          const changeset1 = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);

          const entity1 = createStringifiedFakeEntity({ status: EntityStatus.COMPLETED, changesetId: changeset1.changesetId });
          const entity2 = createStringifiedFakeEntity({ status: EntityStatus.FAILED });
          // post entities of the file and changeset, one entitiy failed
          const file1Entities = [entity1, entity2];
          expect(await entityRequestSender.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
          expect(await changesetRequestSender.patchChangesetEntities(changeset1.changesetId as string)).toHaveStatus(StatusCodes.OK);
          expect(await changesetRequestSender.putChangesets([changeset1.changesetId as string])).toHaveStatus(StatusCodes.OK);

          // validate base sync is still in progress
          expect(await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType)).toHaveProperty(
            'body.status',
            Status.IN_PROGRESS
          );

          // mark the base sync as failure and rerun
          expect(await syncRequestSender.patchSync(baseSyncId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const { rerunId } = rerunCreateBody;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody)).toHaveStatus(httpStatus.CREATED);

          // validate expected entity history
          const entity1History = await entityHistoryRepository.findOneBy({ entityId: entity1.entityId, fileId: file1.fileId, syncId: baseSyncId });
          expect(entity1History).toMatchObject({
            ...entity1,
            fileId: file1.fileId,
            changesetId: changeset1.changesetId,
            status: EntityStatus.COMPLETED,
            syncId: baseSyncId,
            baseSyncId: null,
          });

          const entity2History = await entityHistoryRepository.findOneBy({ entityId: entity2.entityId, fileId: file1.fileId, syncId: baseSyncId });
          expect(entity2History).toMatchObject({
            ...entity2,
            fileId: file1.fileId,
            changesetId: null,
            status: EntityStatus.FAILED,
            syncId: baseSyncId,
            baseSyncId: null,
          });

          // the completed entity should remain completed
          const fetchedEntity1 = await entityRepository.findOneBy({ entityId: entity1.entityId });
          expect(fetchedEntity1).toMatchObject({ ...entity1, status: EntityStatus.COMPLETED, fileId: file1.fileId, failReason: null });

          // the failed entity should reset
          const fetchedEntity2 = await entityRepository.findOneBy({ entityId: entity2.entityId });
          expect(fetchedEntity2).toMatchObject({
            ...entity2,
            fileId: file1.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          // create another changeset
          const changeset2 = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);

          // post file1 again for the rerun
          expect(await fileRequestSender.postFile(rerunId as string, file1)).toHaveStatus(StatusCodes.CREATED);

          // set all file1 entities as completed and on the new changeset
          const file1EntitiesChangeset2 = file1Entities.map((entity) => {
            return {
              ...entity,
              status: EntityStatus.COMPLETED,
              changesetId: changeset2.changesetId,
            };
          });
          expect(await entityRequestSender.postEntityBulk(file1.fileId as string, file1EntitiesChangeset2)).toHaveStatus(StatusCodes.CREATED);

          // post file2 and its entities
          const file2 = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(rerunId as string, file2)).toHaveStatus(StatusCodes.CREATED);
          const file2Entities = [createStringifiedFakeEntity({ status: EntityStatus.COMPLETED, changesetId: changeset2.changesetId })];
          expect(await entityRequestSender.postEntityBulk(file2.fileId as string, file2Entities)).toHaveStatus(StatusCodes.CREATED);

          // close the changeset
          expect(await changesetRequestSender.patchChangesetEntities(changeset1.changesetId as string)).toHaveStatus(StatusCodes.OK);
          const putChangesetsResponse = await changesetRequestSender.putChangesets([changeset2.changesetId as string]);
          expect(putChangesetsResponse).toHaveStatus(StatusCodes.OK);
          expect(putChangesetsResponse.body).toMatchObject([baseSyncId]);

          const latestSyncResponse = await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType);
          expect(latestSyncResponse.status).toBe(httpStatus.OK);
          expect(latestSyncResponse.body).toMatchObject({ ...baseSync, status: Status.COMPLETED });

          // validate entity history count
          const entityHistoryCount = await entityHistoryRepository.countBy({ syncId: In([baseSyncId, rerunId]) });
          expect(entityHistoryCount).toBe(2);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should complete a sync on the second rerun',
        async function () {
          // create the base sync
          const baseSync = createStringifiedFakeSync({ totalFiles: 4 });
          expect(await syncRequestSender.postSync(baseSync)).toHaveStatus(StatusCodes.CREATED);
          const { id: baseSyncId } = baseSync;

          // create files and changeset
          const file1 = createStringifiedFakeFile({ totalEntities: 3 });
          expect(await fileRequestSender.postFile(baseSyncId as string, file1)).toHaveStatus(StatusCodes.CREATED);
          const file2 = createStringifiedFakeFile({ totalEntities: 2 });
          expect(await fileRequestSender.postFile(baseSyncId as string, file2)).toHaveStatus(StatusCodes.CREATED);
          const changeset1 = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);

          const entity1 = createStringifiedFakeEntity({ status: EntityStatus.COMPLETED, changesetId: changeset1.changesetId });
          const entity2 = createStringifiedFakeEntity({ status: EntityStatus.IN_PROGRESS });
          const entity3 = createStringifiedFakeEntity({ status: EntityStatus.IN_PROGRESS });
          expect(await entityRequestSender.postEntityBulk(file1.fileId as string, [entity1, entity2, entity3])).toHaveStatus(StatusCodes.CREATED);
          expect(
            await entityRequestSender.patchEntity(file1.fileId as string, entity2.entityId as string, {
              ...entity2,
              status: EntityStatus.FAILED,
              failReason: 'some reason',
            })
          ).toHaveStatus(StatusCodes.OK);

          const entity4 = createStringifiedFakeEntity({ status: EntityStatus.NOT_SYNCED });
          expect(await entityRequestSender.postEntityBulk(file2.fileId as string, [entity4])).toHaveStatus(StatusCodes.CREATED);

          expect(await changesetRequestSender.patchChangesetEntities(changeset1.changesetId as string)).toHaveStatus(StatusCodes.OK);
          expect(await changesetRequestSender.putChangesets([changeset1.changesetId as string])).toHaveStatus(StatusCodes.OK);

          // validate base sync is still in progress
          expect(await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType)).toHaveProperty(
            'body.status',
            Status.IN_PROGRESS
          );

          // rerunning the sync while its is still in progress results in a conflict
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const { rerunId: firstRerunId } = rerunCreateBody;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody)).toHaveStatus(StatusCodes.CONFLICT);

          // mark the base sync as failure and rerun
          expect(await syncRequestSender.patchSync(baseSyncId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          // validate expected entity history
          let entity1History = await entityHistoryRepository.findOneBy({ entityId: entity1.entityId, fileId: file1.fileId, syncId: baseSyncId });
          expect(entity1History).toMatchObject({
            ...entity1,
            fileId: file1.fileId,
            changesetId: changeset1.changesetId,
            syncId: baseSyncId,
            status: EntityStatus.COMPLETED,
            baseSyncId: null,
          });
          let entity2History = await entityHistoryRepository.findOneBy({ entityId: entity2.entityId, fileId: file1.fileId, syncId: baseSyncId });
          expect(entity2History).toMatchObject({
            ...entity2,
            changesetId: null,
            fileId: file1.fileId,
            syncId: baseSyncId,
            status: EntityStatus.FAILED,
            failReason: 'some reason',
            baseSyncId: null,
          });
          let entity3History = await entityHistoryRepository.findOneBy({ entityId: entity3.entityId, fileId: file1.fileId, syncId: baseSyncId });
          expect(entity3History).toMatchObject({
            ...entity3,
            changesetId: null,
            fileId: file1.fileId,
            syncId: baseSyncId,
            status: EntityStatus.IN_PROGRESS,
            failReason: null,
            baseSyncId: null,
          });
          let entity4History = await entityHistoryRepository.findOneBy({ entityId: entity4.entityId, fileId: file2.fileId, syncId: baseSyncId });
          expect(entity4History).toMatchObject({
            ...entity4,
            changesetId: null,
            fileId: file2.fileId,
            syncId: baseSyncId,
            status: EntityStatus.NOT_SYNCED,
            failReason: null,
            baseSyncId: null,
          });

          // the completed entity should remain completed
          let fetchedEntity1 = await entityRepository.findOneBy({ entityId: entity1.entityId });
          expect(fetchedEntity1).toMatchObject({ ...entity1, status: EntityStatus.COMPLETED, fileId: file1.fileId, failReason: null });

          // the inprogress entities should reset
          let fetchedEntity2 = await entityRepository.findOneBy({ entityId: entity2.entityId });
          expect(fetchedEntity2).toMatchObject({
            ...entity2,
            fileId: file1.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          let fetchedEntity3 = await entityRepository.findOneBy({ entityId: entity3.entityId });
          expect(fetchedEntity3).toMatchObject({
            ...entity3,
            fileId: file1.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          // the failed entity should also reset
          let fetchedEntity4 = await entityRepository.findOneBy({ entityId: entity4.entityId });
          expect(fetchedEntity4).toMatchObject({
            ...entity4,
            fileId: file2.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          // create another changeset and a files
          const changeset2 = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);
          const file3 = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(firstRerunId as string, file3)).toHaveStatus(StatusCodes.CREATED);
          const file4 = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(firstRerunId as string, file4)).toHaveStatus(StatusCodes.CREATED);

          // post file1 again for the rerun
          expect(await fileRequestSender.postFile(firstRerunId as string, file1)).toHaveStatus(StatusCodes.CREATED);

          entity2.status = EntityStatus.COMPLETED;
          entity2.changesetId = changeset2.changesetId;
          entity2.failReason = undefined;
          entity3.status = EntityStatus.FAILED;
          expect(await entityRequestSender.postEntityBulk(file1.fileId as string, [entity2, entity3])).toHaveStatus(StatusCodes.CREATED);

          // file2 should already exist without posting it again
          entity4.status = EntityStatus.COMPLETED;
          entity4.changesetId = changeset2.changesetId;
          expect(await entityRequestSender.postEntityBulk(file2.fileId as string, [entity4])).toHaveStatus(StatusCodes.CREATED);

          const entity5 = createStringifiedFakeEntity({ status: EntityStatus.COMPLETED, changesetId: changeset2.changesetId });
          expect(await entityRequestSender.postEntityBulk(file4.fileId as string, [entity5])).toHaveStatus(StatusCodes.CREATED);

          // close the changeset
          expect(await changesetRequestSender.patchChangesetEntities(changeset2.changesetId as string)).toHaveStatus(StatusCodes.OK);
          expect(await changesetRequestSender.putChangesets([changeset2.changesetId as string])).toHaveStatus(StatusCodes.OK);

          // validate base sync is still failed
          expect(await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType)).toHaveProperty(
            'body.status',
            Status.FAILED
          );

          // rerunning the sync while rerun is still in progress results in a conflict
          const secondRerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const { rerunId: secondRerunId } = secondRerunCreateBody;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, secondRerunCreateBody)).toHaveStatus(StatusCodes.CONFLICT);

          // mark the first rerun sync as failure and rerun again
          expect(await syncRequestSender.patchSync(firstRerunId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(baseSyncId as string, secondRerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          // validate entity history
          entity1History = await entityHistoryRepository.findOneBy({ entityId: entity1.entityId, syncId: firstRerunId });
          expect(entity1History).toBeNull();
          entity2History = await entityHistoryRepository.findOneBy({ entityId: entity2.entityId, fileId: file1.fileId, syncId: firstRerunId });
          expect(entity2History).toMatchObject({
            ...entity2,
            changesetId: changeset2.changesetId,
            fileId: file1.fileId,
            syncId: firstRerunId,
            status: EntityStatus.COMPLETED,
            failReason: null,
            baseSyncId: baseSyncId,
          });
          entity3History = await entityHistoryRepository.findOneBy({ entityId: entity3.entityId, fileId: file1.fileId, syncId: firstRerunId });
          expect(entity3History).toMatchObject({
            ...entity3,
            changesetId: null,
            fileId: file1.fileId,
            syncId: firstRerunId,
            status: EntityStatus.FAILED,
            failReason: null,
            baseSyncId: baseSyncId,
          });
          entity4History = await entityHistoryRepository.findOneBy({ entityId: entity4.entityId, fileId: file2.fileId, syncId: firstRerunId });
          expect(entity4History).toMatchObject({
            ...entity4,
            fileId: file2.fileId,
            syncId: firstRerunId,
            changesetId: changeset2.changesetId,
            status: EntityStatus.COMPLETED,
            baseSyncId: baseSyncId,
          });
          const entity5History = await entityHistoryRepository.findOneBy({ entityId: entity5.entityId, fileId: file4.fileId, syncId: firstRerunId });
          expect(entity5History).toMatchObject({
            ...entity5,
            fileId: file4.fileId,
            changesetId: changeset2.changesetId,
            syncId: firstRerunId,
            status: EntityStatus.COMPLETED,
            baseSyncId: baseSyncId,
          });

          // the completed entities should remain completed
          fetchedEntity1 = await entityRepository.findOneBy({ entityId: entity1.entityId });
          expect(fetchedEntity1).toMatchObject({ ...entity1, status: EntityStatus.COMPLETED, fileId: file1.fileId, failReason: null });
          fetchedEntity2 = await entityRepository.findOneBy({ entityId: entity2.entityId });
          expect(fetchedEntity2).toMatchObject({ ...entity2, status: EntityStatus.COMPLETED, fileId: file1.fileId, failReason: null });
          fetchedEntity4 = await entityRepository.findOneBy({ entityId: entity4.entityId });
          expect(fetchedEntity4).toMatchObject({ ...entity4, status: EntityStatus.COMPLETED, fileId: file2.fileId, failReason: null });
          const fetchedEntity5 = await entityRepository.findOneBy({ entityId: entity5.entityId });
          expect(fetchedEntity5).toMatchObject({ ...entity5, status: EntityStatus.COMPLETED, fileId: file4.fileId, failReason: null });

          // the failed entity should reset
          fetchedEntity3 = await entityRepository.findOneBy({ entityId: entity3.entityId });
          expect(fetchedEntity3).toMatchObject({
            ...entity3,
            fileId: file1.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          // create another changeset
          const changeset3 = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset3)).toHaveStatus(StatusCodes.CREATED);

          const entity6 = createStringifiedFakeEntity({ status: EntityStatus.COMPLETED, changesetId: changeset3.changesetId });
          const entity7 = createStringifiedFakeEntity({ status: EntityStatus.IN_PROGRESS });

          expect(await entityRequestSender.postEntityBulk(file1.fileId as string, [entity3])).toHaveStatus(StatusCodes.CREATED);
          expect(
            await entityRequestSender.patchEntity(file1.fileId as string, entity3.entityId as string, { ...entity3, status: EntityStatus.NOT_SYNCED })
          ).toHaveStatus(StatusCodes.OK);
          expect(await entityRequestSender.postEntityBulk(file2.fileId as string, [entity6])).toHaveStatus(StatusCodes.CREATED);

          // file3 had no entities so it was deleted on the rerun
          expect(await fileRequestSender.postFile(firstRerunId as string, file3)).toHaveStatus(StatusCodes.CREATED);
          expect(await entityRequestSender.postEntityBulk(file3.fileId as string, [entity7])).toHaveStatus(StatusCodes.CREATED);
          expect(await changesetRequestSender.patchChangesetEntities(changeset3.changesetId as string)).toHaveStatus(StatusCodes.OK);
          expect(await changesetRequestSender.putChangesets([changeset3.changesetId as string])).toHaveStatus(StatusCodes.OK);

          const patchEntityResponse = await entityRequestSender.patchEntity(file3.fileId as string, entity7.entityId as string, {
            ...entity7,
            status: EntityStatus.NOT_SYNCED,
          });

          expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
          expect(patchEntityResponse.body).toMatchObject([baseSyncId]);

          // validate latest sync is the base as completed
          const latestSyncResponse = await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType);
          expect(latestSyncResponse.status).toBe(StatusCodes.OK);
          expect(latestSyncResponse.body).toMatchObject({ ...baseSync, status: Status.COMPLETED });

          // rerunning the sync when its completed will result in a conflict
          const thirdRerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          expect(await syncRequestSender.rerunSync(baseSyncId as string, thirdRerunCreateBody)).toHaveStatus(StatusCodes.CONFLICT);

          // validate entity history count
          const entityHistoryCount = await entityHistoryRepository.countBy({ syncId: In([baseSyncId, firstRerunId, secondRerunId]) });
          expect(entityHistoryCount).toBe(8);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should complete a sync on the third rerun',
        async function () {
          // create the base sync
          const baseSync = createStringifiedFakeSync({ totalFiles: 1 });
          expect(await syncRequestSender.postSync(baseSync)).toHaveStatus(StatusCodes.CREATED);
          const { id: baseSyncId } = baseSync;

          // mark the base sync as failure and rerun
          expect(await syncRequestSender.patchSync(baseSyncId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const rerunCreateBody1 = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const { rerunId: rerunId1 } = rerunCreateBody1;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody1)).toHaveStatus(httpStatus.CREATED);

          // validate entity history count
          let entityHistoryCount = await entityHistoryRepository.countBy({ syncId: baseSyncId });
          expect(entityHistoryCount).toBe(0);

          expect(await syncRequestSender.patchSync(rerunId1 as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const rerunCreateBody2 = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const { rerunId: rerunId2 } = rerunCreateBody2;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody2)).toHaveStatus(httpStatus.CREATED);

          // validate entity history count
          entityHistoryCount = await entityHistoryRepository.countBy({ syncId: In([baseSyncId, rerunId1]) });
          expect(entityHistoryCount).toBe(0);

          expect(await syncRequestSender.patchSync(rerunId2 as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const rerunCreateBody3 = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const { rerunId: rerunId3 } = rerunCreateBody3;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody3)).toHaveStatus(httpStatus.CREATED);

          // validate entity history count
          entityHistoryCount = await entityHistoryRepository.countBy({ syncId: In([baseSyncId, rerunId1, rerunId2]) });
          expect(entityHistoryCount).toBe(0);

          const file = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(rerunId3 as string, file)).toHaveStatus(StatusCodes.CREATED);

          const changeset = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

          const entity = createStringifiedFakeEntity({ status: EntityStatus.COMPLETED, changesetId: changeset.changesetId });
          expect(await entityRequestSender.postEntityBulk(file.fileId as string, [entity])).toHaveStatus(StatusCodes.CREATED);

          expect(await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);
          const putChangesetsResponse = await changesetRequestSender.putChangesets([changeset.changesetId as string]);
          expect(putChangesetsResponse).toHaveStatus(StatusCodes.OK);
          expect(putChangesetsResponse.body).toMatchObject([baseSyncId]);

          const latestSyncResponse = await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType);
          expect(latestSyncResponse.status).toBe(httpStatus.OK);
          expect(latestSyncResponse.body).toMatchObject({ ...baseSync, status: Status.COMPLETED });

          entityHistoryCount = await entityHistoryRepository.countBy({ syncId: In([baseSyncId, rerunId1, rerunId2, rerunId3]) });
          expect(entityHistoryCount).toBe(0);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should complete a sync on a rerun with falsy shouldRerunNotSynced flag',
        async function () {
          // create the base sync
          const baseSync = createStringifiedFakeSync({ isFull: false, totalFiles: 1 });
          expect(await syncRequestSender.postSync(baseSync)).toHaveStatus(StatusCodes.CREATED);
          const { id: baseSyncId } = baseSync;

          // create file, failed and not synced entities and post them
          const file = createStringifiedFakeFile({ totalEntities: 2 });
          expect(await fileRequestSender.postFile(baseSyncId as string, file)).toHaveStatus(StatusCodes.CREATED);
          const entity1 = createStringifiedFakeEntity({ status: EntityStatus.NOT_SYNCED });
          const entity2 = createStringifiedFakeEntity({ status: EntityStatus.FAILED });
          const file1Entities = [entity1, entity2];
          expect(await entityRequestSender.postEntityBulk(file.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);

          // validate base sync is still in progress
          expect(await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType)).toHaveProperty(
            'body.status',
            Status.IN_PROGRESS
          );

          // mark the base sync as failure and rerun
          expect(await syncRequestSender.patchSync(baseSyncId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: false });
          const { rerunId } = rerunCreateBody;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody)).toHaveStatus(httpStatus.CREATED);

          // validate expected entity history
          const entity1History = await entityHistoryRepository.findOneBy({ entityId: entity1.entityId, fileId: file.fileId, syncId: baseSyncId });
          expect(entity1History).toMatchObject({
            ...entity1,
            fileId: file.fileId,
            changesetId: null,
            status: EntityStatus.NOT_SYNCED,
            syncId: baseSyncId,
            baseSyncId: null,
          });

          const entity2History = await entityHistoryRepository.findOneBy({ entityId: entity2.entityId, fileId: file.fileId, syncId: baseSyncId });
          expect(entity2History).toMatchObject({
            ...entity2,
            fileId: file.fileId,
            changesetId: null,
            status: EntityStatus.FAILED,
            syncId: baseSyncId,
            baseSyncId: null,
          });

          // the not_synced entity should remain not_synced
          const fetchedEntity1 = await entityRepository.findOneBy({ entityId: entity1.entityId });
          expect(fetchedEntity1).toMatchObject({
            ...entity1,
            status: EntityStatus.NOT_SYNCED,
            changesetId: null,
            fileId: file.fileId,
            failReason: null,
          });

          // the failed entity should reset
          const fetchedEntity2 = await entityRepository.findOneBy({ entityId: entity2.entityId });
          expect(fetchedEntity2).toMatchObject({
            ...entity2,
            fileId: file.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          // create changeset
          const changeset = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

          // post the file again for the rerun
          expect(await fileRequestSender.postFile(rerunId as string, file)).toHaveStatus(StatusCodes.CREATED);

          // set the failed entity in the file as completed and on the new changeset
          const completedEntity2 = [{ ...entity2, status: EntityStatus.COMPLETED, changesetId: changeset.changesetId }];
          expect(await entityRequestSender.postEntityBulk(file.fileId as string, completedEntity2)).toHaveStatus(StatusCodes.CREATED);

          // close the changeset
          expect(await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);
          const putChangesetsResponse = await changesetRequestSender.putChangesets([changeset.changesetId as string]);
          expect(putChangesetsResponse).toHaveStatus(StatusCodes.OK);
          expect(putChangesetsResponse.body).toMatchObject([baseSyncId]);

          const latestSyncResponse = await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType);
          expect(latestSyncResponse.status).toBe(httpStatus.OK);
          expect(latestSyncResponse.body).toMatchObject({ ...baseSync, status: Status.COMPLETED });

          // validate entity history count
          const entityHistoryCount = await entityHistoryRepository.countBy({ syncId: In([baseSyncId, rerunId]) });
          expect(entityHistoryCount).toBe(2);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should complete a sync on a rerun with falsy shouldRerunNotSynced flag where one file consisting only not synced',
        async function () {
          // create the base sync
          const baseSync = createStringifiedFakeSync({ isFull: false, totalFiles: 2 });
          expect(await syncRequestSender.postSync(baseSync)).toHaveStatus(StatusCodes.CREATED);
          const { id: baseSyncId } = baseSync;

          // create files
          const file1 = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(baseSyncId as string, file1)).toHaveStatus(StatusCodes.CREATED);

          const file2 = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(baseSyncId as string, file2)).toHaveStatus(StatusCodes.CREATED);

          const entity1 = createStringifiedFakeEntity({ status: EntityStatus.NOT_SYNCED });
          const entity2 = createStringifiedFakeEntity({ status: EntityStatus.FAILED });
          expect(await entityRequestSender.postEntityBulk(file1.fileId as string, [entity1])).toHaveStatus(StatusCodes.CREATED);
          expect(await entityRequestSender.postEntityBulk(file2.fileId as string, [entity2])).toHaveStatus(StatusCodes.CREATED);

          // validate base sync is still in progress
          expect(await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType)).toHaveProperty(
            'body.status',
            Status.IN_PROGRESS
          );

          // mark the base sync as failure and rerun
          expect(await syncRequestSender.patchSync(baseSyncId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: false });
          const { rerunId } = rerunCreateBody;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, rerunCreateBody)).toHaveStatus(httpStatus.CREATED);

          // validate expected entity history
          const entity1History = await entityHistoryRepository.findOneBy({ entityId: entity1.entityId, fileId: file1.fileId, syncId: baseSyncId });
          expect(entity1History).toMatchObject({
            ...entity1,
            fileId: file1.fileId,
            changesetId: null,
            status: EntityStatus.NOT_SYNCED,
            syncId: baseSyncId,
            baseSyncId: null,
          });

          const entity2History = await entityHistoryRepository.findOneBy({ entityId: entity2.entityId, fileId: file2.fileId, syncId: baseSyncId });
          expect(entity2History).toMatchObject({
            ...entity2,
            fileId: file2.fileId,
            changesetId: null,
            status: EntityStatus.FAILED,
            syncId: baseSyncId,
            baseSyncId: null,
          });

          // the not_synced entity should remain not_synced
          const fetchedEntity1 = await entityRepository.findOneBy({ entityId: entity1.entityId });
          expect(fetchedEntity1).toMatchObject({
            ...entity1,
            status: EntityStatus.NOT_SYNCED,
            changesetId: null,
            fileId: file1.fileId,
            failReason: null,
          });

          // the failed entity should reset
          const fetchedEntity2 = await entityRepository.findOneBy({ entityId: entity2.entityId });
          expect(fetchedEntity2).toMatchObject({
            ...entity2,
            fileId: file2.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          // create changeset
          const changeset = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

          // post file2 again for the rerun
          expect(await fileRequestSender.postFile(rerunId as string, file2)).toHaveStatus(StatusCodes.CREATED);

          // set the failed entity in file2 as completed and on the new changeset
          const completedEntity2 = [{ ...entity2, status: EntityStatus.COMPLETED, changesetId: changeset.changesetId }];
          expect(await entityRequestSender.postEntityBulk(file2.fileId as string, completedEntity2)).toHaveStatus(StatusCodes.CREATED);

          // close the changeset
          expect(await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);
          const putChangesetsResponse = await changesetRequestSender.putChangesets([changeset.changesetId as string]);
          expect(putChangesetsResponse).toHaveStatus(StatusCodes.OK);
          expect(putChangesetsResponse.body).toMatchObject([baseSyncId]);

          const latestSyncResponse = await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType);
          expect(latestSyncResponse.status).toBe(httpStatus.OK);
          expect(latestSyncResponse.body).toMatchObject({ ...baseSync, status: Status.COMPLETED });

          // validate entity history count
          const entityHistoryCount = await entityHistoryRepository.countBy({ syncId: In([baseSyncId, rerunId]) });
          expect(entityHistoryCount).toBe(2);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should on a rerun mark a file as in progress if it was completed while having not-synced entities',
        async function () {
          // create the base sync
          const baseSync = createStringifiedFakeSync({ isFull: false, totalFiles: 2 });
          expect(await syncRequestSender.postSync(baseSync)).toHaveStatus(StatusCodes.CREATED);
          const { id: baseSyncId } = baseSync;

          // create its 2 files
          const file1 = createStringifiedFakeFile({ totalEntities: 1 });
          const file2 = createStringifiedFakeFile({ totalEntities: 1 });
          expect(await fileRequestSender.postFile(baseSyncId as string, file1)).toHaveStatus(StatusCodes.CREATED);
          expect(await fileRequestSender.postFile(baseSyncId as string, file2)).toHaveStatus(StatusCodes.CREATED);

          const entity1 = createStringifiedFakeEntity();
          expect(await entityRequestSender.postEntityBulk(file1.fileId as string, [entity1])).toHaveStatus(StatusCodes.CREATED);

          expect(
            await entityRequestSender.patchEntity(file1.fileId as string, entity1.entityId as string, {
              ...entity1,
              status: EntityStatus.NOT_SYNCED,
            })
          ).toHaveStatus(StatusCodes.OK);

          // validate base sync is still in progress even though file1 completed
          expect(await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType)).toHaveProperty(
            'body.status',
            Status.IN_PROGRESS
          );

          // mark the base sync as failure and rerun
          expect(await syncRequestSender.patchSync(baseSyncId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const firstRerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const { rerunId: firstRerunId } = firstRerunCreateBody;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, firstRerunCreateBody)).toHaveStatus(httpStatus.CREATED);

          let entity1History = await entityHistoryRepository.findOneBy({ entityId: entity1.entityId, fileId: file1.fileId, syncId: baseSyncId });
          expect(entity1History).toMatchObject({
            ...entity1,
            changesetId: null,
            fileId: file1.fileId,
            syncId: baseSyncId,
            status: EntityStatus.NOT_SYNCED,
            failReason: null,
            baseSyncId: null,
          });

          // the not synced entity should reset
          let fetchedEntity1 = await entityRepository.findOneBy({ entityId: entity1.entityId });
          expect(fetchedEntity1).toMatchObject({
            ...entity1,
            fileId: file1.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          // create changeset and a complete entity for file2
          const changeset = createStringifiedFakeChangeset();
          expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

          // file2 was deleted on the rerun due to it being empty
          expect(await fileRequestSender.postFile(baseSyncId as string, file2)).toHaveStatus(StatusCodes.CREATED);
          const entity2 = createStringifiedFakeEntity({ changesetId: changeset.changesetId, status: EntityStatus.COMPLETED });
          expect(await entityRequestSender.postEntityBulk(file2.fileId as string, [entity2])).toHaveStatus(StatusCodes.CREATED);

          expect(await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);
          expect(await changesetRequestSender.putChangesets([changeset.changesetId as string])).toHaveStatus(StatusCodes.OK);

          // validate base sync is still failed even though file2 completed
          expect(await syncRequestSender.getLatestSync(baseSync.layerId as number, baseSync.geometryType as GeometryType)).toHaveProperty(
            'body.status',
            Status.FAILED
          );

          // mark the first rerun as failure and rerun again
          expect(await syncRequestSender.patchSync(firstRerunId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          const secondRerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const { rerunId: secondRerunId } = secondRerunCreateBody;
          expect(await syncRequestSender.rerunSync(baseSyncId as string, secondRerunCreateBody)).toHaveStatus(httpStatus.CREATED);

          entity1History = await entityHistoryRepository.findOneBy({ entityId: entity1.entityId, syncId: firstRerunId });
          expect(entity1History).toBeNull();

          const entity2History = await entityHistoryRepository.findOneBy({ entityId: entity2.entityId, fileId: file2.fileId, syncId: firstRerunId });
          expect(entity2History).toMatchObject({
            ...entity2,
            changesetId: changeset.changesetId,
            fileId: file2.fileId,
            syncId: firstRerunId,
            status: EntityStatus.COMPLETED,
            failReason: null,
            baseSyncId: baseSyncId,
          });

          // the failed entity should reset
          fetchedEntity1 = await entityRepository.findOneBy({ entityId: entity1.entityId });
          expect(fetchedEntity1).toMatchObject({
            ...entity1,
            fileId: file1.fileId,
            status: EntityStatus.IN_RERUN,
            changesetId: null,
            action: null,
            failReason: null,
          });

          // the completed entity should remain completed
          const fetchedEntity2 = await entityRepository.findOneBy({ entityId: entity2.entityId });
          expect(fetchedEntity2).toMatchObject({ ...entity2, status: EntityStatus.COMPLETED, fileId: file2.fileId, failReason: null });

          const patchEntityResponse = await entityRequestSender.patchEntity(file1.fileId as string, entity1.entityId as string, {
            ...entity1,
            status: EntityStatus.NOT_SYNCED,
          });

          expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
          expect(patchEntityResponse.body).toMatchObject([baseSyncId]);

          // validate entity history count
          const entityHistoryCount = await entityHistoryRepository.countBy({ syncId: In([baseSyncId, firstRerunId, secondRerunId]) });
          expect(entityHistoryCount).toBe(2);
        },
        RERUN_TEST_TIMEOUT
      );
    });

    describe('PATCH /sync/:syncId/file/:fileId', function () {
      it('should return 200 status code and no closed syncs from the patch', async function () {
        const syncBody = createStringifiedFakeSync({ totalFiles: 2 });
        const fileBody = createStringifiedFakeFile();

        expect(await syncRequestSender.postSync(syncBody)).toHaveStatus(StatusCodes.CREATED);
        const { id: syncId } = syncBody;

        expect(await fileRequestSender.postFile(syncId as string, fileBody)).toHaveStatus(StatusCodes.CREATED);
        const { fileId, totalEntities } = fileBody;

        const response = await fileRequestSender.patchFile(syncId as string, fileId as string, { totalEntities: (totalEntities as number) - 1 });

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toEqual([]);
      });

      it('should return 200 status code and a closed sync id from the patch', async function () {
        const syncBody = createStringifiedFakeSync({ totalFiles: 1 });
        const fileBody = createStringifiedFakeFile({ totalEntities: 1 });

        expect(await syncRequestSender.postSync(syncBody)).toHaveStatus(StatusCodes.CREATED);
        const { id: syncId } = syncBody;

        expect(await fileRequestSender.postFile(syncId as string, fileBody)).toHaveStatus(StatusCodes.CREATED);
        const { fileId } = fileBody;

        const response = await fileRequestSender.patchFile(syncId as string, fileId as string, { totalEntities: 0 });

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toEqual([syncId]);
      });

      it('should return 200 status code and a closed sync id from the patch when all other files is already completed', async function () {
        const sync = createStringifiedFakeSync({ totalFiles: 2 });
        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        const file1 = createStringifiedFakeFile({ totalEntities: 1 });
        expect(await fileRequestSender.postFile(sync.id as string, file1)).toHaveStatus(StatusCodes.CREATED);

        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        const file1Entity = [createStringifiedFakeEntity({ status: EntityStatus.COMPLETED, changesetId: changeset.changesetId })];
        expect(await entityRequestSender.postEntityBulk(file1.fileId as string, file1Entity)).toHaveStatus(StatusCodes.CREATED);
        expect(await changesetRequestSender.putChangesets([changeset.changesetId as string])).toHaveStatus(StatusCodes.OK);

        const file2 = createStringifiedFakeFile({ totalEntities: 1 });
        expect(await fileRequestSender.postFile(sync.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        const response = await fileRequestSender.patchFile(sync.id as string, file2.fileId as string, { totalEntities: 0 });

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toEqual([sync.id]);
      });
    });
  });

  describe('Bad Path', function () {
    describe('POST /sync', function () {
      it('should return 400 if the id is not valid', async function () {
        const body = createStringifiedFakeSync({ id: faker.random.word() });

        const response = await syncRequestSender.postSync(body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.id should match format "uuid"');
      });

      it('should return 400 if geometryType property is not valid', async function () {
        const body = createStringifiedFakeSync({ geometryType: 'invalid' as GeometryType });

        const response = await syncRequestSender.postSync(body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.body.geometryType should be equal to one of the allowed values: point, linestring, polygon'
        );
      });

      it('should return 400 if a required property is missing', async function () {
        const { dumpDate, ...body } = createStringifiedFakeSync();

        const response = await syncRequestSender.postSync(body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'dumpDate'");
      });

      it('should return 400 if geometryType is missing', async function () {
        const { geometryType, ...body } = createStringifiedFakeSync();

        const response = await syncRequestSender.postSync(body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'geometryType'");
      });

      it('should return 409 if a sync already exists', async function () {
        const body = createStringifiedFakeSync();
        expect(await syncRequestSender.postSync(body)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.postSync(body);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });

      it('should return 409 if a full sync already exists with the same layerId and geometryType', async function () {
        const alreadyExistingFullSync = createStringifiedFakeSync({ isFull: true });
        const { id, ...rest } = alreadyExistingFullSync;
        const fullSync = createStringifiedFakeSync(rest);
        expect(await syncRequestSender.postSync(alreadyExistingFullSync)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.postSync(fullSync);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('PATCH /sync', function () {
      it('should return 400 if the id is not valid', async function () {
        const { id, isFull, ...body } = createStringifiedFakeSync();

        const response = await syncRequestSender.patchSync(faker.random.word(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.syncId should match format "uuid"');
      });

      it('should return 400 if a date is not valid', async function () {
        const { id, isFull, ...body } = createStringifiedFakeSync({ dumpDate: faker.random.word() });

        const response = await syncRequestSender.patchSync(id as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.dumpDate should match format "date-time"');
      });

      it('should return 400 if geometryType property is not valid', async function () {
        const { id, isFull, ...body } = createStringifiedFakeSync({ geometryType: 'invalid' as GeometryType });

        const response = await syncRequestSender.patchSync(id as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.body.geometryType should be equal to one of the allowed values: point, linestring, polygon'
        );
      });

      it('should return 400 if an additional property was added to the payload', async function () {
        const { id, ...body } = createStringifiedFakeSync();

        const response = await syncRequestSender.patchSync(id as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body should NOT have additional properties');
      });

      it('should return 404 if no sync with the specified id was found', async function () {
        const { id, isFull, ...body } = createStringifiedFakeSync();

        const response = await syncRequestSender.patchSync(faker.datatype.uuid(), body);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('GET /sync/latest', function () {
      it('should return 400 if the layerId is not valid', async function () {
        const response = await syncRequestSender.getLatestSync(faker.random.word() as unknown as number, GeometryType.POLYGON);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.query.layerId should be integer');
      });

      it('should return 400 if the geometryType is not valid', async function () {
        const response = await syncRequestSender.getLatestSync(generateUniqueNumber(), faker.random.word() as unknown as GeometryType);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.query.geometryType should be equal to one of the allowed values: point, linestring, polygon'
        );
      });

      it('should return 404 if no sync with the specified layerId was found', async function () {
        const response = await syncRequestSender.getLatestSync(generateUniqueNumber(), GeometryType.POLYGON);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 404 if no sync with the specified geomertyType was found', async function () {
        const sync = createStringifiedFakeSync({ geometryType: GeometryType.POLYGON });

        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getLatestSync(sync.layerId as number, GeometryType.LINESTRING);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('POST /sync/:syncId/rerun', function () {
      it(
        'should return 400 if rerun creation body is missing startDate property',
        async function () {
          const sync = createStringifiedFakeSync();
          const { id } = sync;

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          const response = await syncRequestSender.rerunSync(id as string, { rerunId: faker.datatype.uuid() });
          expect(response).toHaveProperty('status', StatusCodes.BAD_REQUEST);
          expect(response.body).toHaveProperty('message', `request.body should have required property 'startDate'`);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 400 if rerun creation body is missing rerunId property',
        async function () {
          const sync = createStringifiedFakeSync();
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody();
          const { startDate } = rerunCreateBody;

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          const response = await syncRequestSender.rerunSync(id as string, { startDate });
          expect(response).toHaveProperty('status', StatusCodes.BAD_REQUEST);
          expect(response.body).toHaveProperty('message', `request.body should have required property 'rerunId'`);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 400 if rerun creation body has bad rerunId property',
        async function () {
          const sync = createStringifiedFakeSync();
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ rerunId: 'badId' });

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          const response = await syncRequestSender.rerunSync(id as string, rerunCreateBody);

          expect(response).toHaveProperty('status', StatusCodes.BAD_REQUEST);
          expect(response.body).toHaveProperty('message', `request.body.rerunId should match format "uuid"`);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 400 if rerun creation body has bad startDate property',
        async function () {
          const sync = createStringifiedFakeSync();
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ startDate: 'badDate' });

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          const response = await syncRequestSender.rerunSync(id as string, rerunCreateBody);

          expect(response).toHaveProperty('status', StatusCodes.BAD_REQUEST);
          expect(response.body).toHaveProperty('message', `request.body.startDate should match format "date-time"`);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 409 if a rerun with the same id already exists',
        async function () {
          const sync = createStringifiedFakeSync();
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody();

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(rerunCreateBody.rerunId as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);

          const response = await syncRequestSender.rerunSync(id as string, rerunCreateBody);

          expect(response).toHaveProperty('status', StatusCodes.CONFLICT);
          expect(response.body).toHaveProperty('message', `rerun = ${rerunCreateBody.rerunId as string} already exists`);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 404 if the provided sync id for rerun does not exist',
        async function () {
          const syncId = faker.datatype.uuid();
          const rerunCreateBody = createStringifiedFakeRerunCreateBody();

          const response = await syncRequestSender.rerunSync(syncId, rerunCreateBody);

          expect(response).toHaveProperty('status', StatusCodes.NOT_FOUND);
          expect(response.body).toHaveProperty('message', `sync = ${syncId} not found`);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 409 if the sync to rerun has no failed status',
        async function () {
          const sync = createStringifiedFakeSync();
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody();

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

          const response = await syncRequestSender.rerunSync(id as string, rerunCreateBody);

          expect(response).toHaveProperty('status', StatusCodes.CONFLICT);
          expect(response.body).toHaveProperty('message', `could not rerun sync = ${id as string} due to it not being a failed base sync`);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 409 if the sync to rerun is a rerun',
        async function () {
          const sync = createStringifiedFakeSync({
            isFull: true,
          });
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody();

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          const response = await syncRequestSender.rerunSync(rerunCreateBody.rerunId as string, createStringifiedFakeRerunCreateBody());

          expect(response).toHaveProperty('status', StatusCodes.CONFLICT);
          expect(response.body).toHaveProperty(
            'message',
            `could not rerun sync = ${rerunCreateBody.rerunId as string} due to it not being a failed base sync`
          );
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 409 if the sync to rerun has already a in progress rerun',
        async function () {
          const sync = createStringifiedFakeSync();
          const { id } = sync;
          const rerunCreateBody = createStringifiedFakeRerunCreateBody();

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          const response = await syncRequestSender.rerunSync(id as string, createStringifiedFakeRerunCreateBody());

          expect(response).toHaveProperty('status', StatusCodes.CONFLICT);
          expect(response.body).toHaveProperty(
            'message',
            `could not rerun sync = ${id as string} due to an already existing inprogress rerun = ${rerunCreateBody.rerunId as string}`
          );
        },
        RERUN_TEST_TIMEOUT
      );
    });

    describe('PATCH /sync/:syncId/file/:fileId', function () {
      it('should return 404 if the sync was not found', async function () {
        const syncBody = createStringifiedFakeSync();
        const fileBody = createStringifiedFakeFile();

        const { id: syncId } = syncBody;
        const { fileId, totalEntities } = fileBody;

        const response = await fileRequestSender.patchFile(syncId as string, fileId as string, { totalEntities: (totalEntities as number) - 1 });

        expect(response.status).toBe(httpStatus.NOT_FOUND);
      });

      it('should return 404 if the file was not found', async function () {
        const syncBody = createStringifiedFakeSync();
        const fileBody = createStringifiedFakeFile();

        expect(await syncRequestSender.postSync(syncBody)).toHaveStatus(StatusCodes.CREATED);
        const { id: syncId } = syncBody;

        const { fileId, totalEntities } = fileBody;

        const response = await fileRequestSender.patchFile(syncId as string, fileId as string, { totalEntities: (totalEntities as number) - 1 });

        expect(response.status).toBe(httpStatus.NOT_FOUND);
      });
    });
  });

  describe('Sad Path', function () {
    describe('POST /sync', function () {
      it('should return 500 if the db throws an error', async function () {
        const createSyncMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneSyncMock = jest.fn();
        const findSyncsMock = jest.fn().mockResolvedValue([]);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: SYNC_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: {
              createSync: createSyncMock,
              findOneSync: findOneSyncMock,
              findSyncs: findSyncsMock,
            },
          },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockSyncRequestSender = new SyncRequestSender(mockApp);

        const response = await mockSyncRequestSender.postSync(createStringifiedFakeSync());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /sync', function () {
      it('should return 500 if the db throws an error', async function () {
        const updateSyncMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneSyncMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: SYNC_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: {
              updateSync: updateSyncMock,
              findOneSync: findOneSyncMock,
            },
          },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockSyncRequestSender = new SyncRequestSender(mockApp);
        const { id, isFull, ...body } = createStringifiedFakeSync();

        const response = await mockSyncRequestSender.patchSync(id as string, body);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('GET /sync', function () {
      it('should return 500 if the db throws an error', async function () {
        const filterSyncsMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: SYNC_CUSTOM_REPOSITORY_SYMBOL, provider: { useValue: { filterSyncs: filterSyncsMock } } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockSyncRequestSender = new SyncRequestSender(mockApp);

        const response = await mockSyncRequestSender.getSyncs({});

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('GET /sync/latest', function () {
      it('should return 500 if the db throws an error', async function () {
        const getLatestSyncMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: SYNC_CUSTOM_REPOSITORY_SYMBOL, provider: { useValue: { getLatestSync: getLatestSyncMock } } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockSyncRequestSender = new SyncRequestSender(mockApp);
        const body = createStringifiedFakeSync();

        const response = await mockSyncRequestSender.getLatestSync(body.layerId as number, body.geometryType as GeometryType);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('POST /sync/:syncId/rerun', function () {
      it('should return 500 if the db throws an error', async function () {
        const sync = createStringifiedFakeSync({ status: Status.FAILED });

        const findOneSyncMock = jest.fn();
        const findOneSyncWithLastRerunMock = jest.fn().mockResolvedValue({ ...sync, runNumber: 0, reruns: [] });
        const createRerunMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: SYNC_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: {
              findOneSync: findOneSyncMock,
              findOneSyncWithLastRerun: findOneSyncWithLastRerunMock,
              createRerun: createRerunMock,
            },
          },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockSyncRequestSender = new SyncRequestSender(mockApp);
        const rerunCreateBody = createStringifiedFakeRerunCreateBody();

        const response = await mockSyncRequestSender.rerunSync(sync.id as string, rerunCreateBody);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /sync/:syncId/file/:fileId', function () {
      it('should return 500 if the db throws an error', async function () {
        const updateSyncMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneSyncMock = jest.fn().mockResolvedValue(true);
        const findOneFileMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: SYNC_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: {
              findOneSync: findOneSyncMock,
            },
          },
        });

        mockRegisterOptions.override.push({
          token: FILE_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: {
              findOneFile: findOneFileMock,
              updateFile: updateSyncMock,
            },
          },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        const mockFileRequestSender = new FileRequestSender(mockApp);
        const { id } = createStringifiedFakeSync();
        const { fileId, totalEntities } = createStringifiedFakeFile();

        const response = await mockFileRequestSender.patchFile(id as string, fileId as string, { totalEntities });

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });

      it('should return 500 if transaction failure occurs on multiple retries', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));
        const findOneSyncMock = jest.fn().mockResolvedValue(true);
        const findOneFileMock = jest.fn().mockResolvedValue(true);
        const updateFileMock = jest.fn();

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: SYNC_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: {
              findOneSync: findOneSyncMock,
            },
          },
        });

        mockRegisterOptions.override.push({
          token: FILE_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: {
              findOneFile: findOneFileMock,
              updateFile: updateFileMock,
              tryClosingFile: tryClosingFileMock,
            },
          },
        });

        const retries = faker.datatype.number({ min: 1, max: 10 });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        const mockFileRequestSender = new FileRequestSender(mockApp);

        const body = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const { id } = createStringifiedFakeSync();
        const { fileId, totalEntities } = createStringifiedFakeFile();

        const response = await mockFileRequestSender.patchFile(id as string, fileId as string, { totalEntities });

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(tryClosingFileMock).toHaveBeenCalledTimes(retries + 1);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`exceeded the number of retries (${retries}).`);
      });
    });
  });
});
