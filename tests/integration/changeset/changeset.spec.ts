import httpStatus, { StatusCodes } from 'http-status-codes';
import { faker } from '@faker-js/faker';
import { DependencyContainer } from 'tsyringe';
import { QueryFailedError } from 'typeorm';
import { DelayedError, Worker } from 'bullmq';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { createStringifiedFakeEntity } from '../entity/helpers/generators';
import { EntityStatus, GeometryType, Status } from '../../../src/common/enums';
import { Sync } from '../../../src/sync/models/sync';
import { getApp } from '../../../src/app';
import { EntityRequestSender } from '../entity/helpers/requestSender';
import { FileRequestSender } from '../file/helpers/requestSender';
import { SyncRequestSender } from '../sync/helpers/requestSender';
import { SERVICES } from '../../../src/common/constants';
import { CHANGESET_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/changeset/DAL/changesetRepository';
import { BEFORE_ALL_TIMEOUT, LONG_RUNNING_TEST_TIMEOUT, getBaseRegisterOptions, waitForJobToBeResolved } from '../helpers';
import { QUEUE_PROVIDER_FACTORY, WorkerEnum } from '../../../src/queueProvider/constants';
import { hashBatch } from '../../../src/common/utils';
import * as queueHelpers from '../../../src/queueProvider/helpers';
import { TRANSACTIONAL_FAILURE_COUNT_KEY, DEDUPLICATION_COUNT_KEY } from '../../../src/queueProvider/helpers';
import { ENTITY_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/entity/DAL/entityRepository';
import { QueryFailedErrorWithCode, TransactionFailure } from '../../../src/common/db/transactions';
import { MAX_RANDOM_NUMERIC_VALUE } from '../../helpers/helper';
import { createStringifiedFakeChangeset } from './helpers/generators';
import { ChangesetRequestSender } from './helpers/requestSender';

jest.mock('../../../src/queueProvider/helpers', (): object => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('../../../src/queueProvider/helpers'),
  };
});

describe('changeset', function () {
  let changesetRequestSender: ChangesetRequestSender;
  let entityRequestSender: EntityRequestSender;
  let fileRequestSender: FileRequestSender;
  let syncRequestSender: SyncRequestSender;
  let mockChangesetRequestSender: ChangesetRequestSender;

  let changesetWorker: Worker;
  let fileWorker: Worker;
  let syncWorker: Worker;

  let depContainer: DependencyContainer;
  let mockDepContainer: DependencyContainer;

  beforeAll(async () => {
    const { app, container } = await getApp(getBaseRegisterOptions());
    depContainer = container;
    changesetRequestSender = new ChangesetRequestSender(app);
    entityRequestSender = new EntityRequestSender(app);
    fileRequestSender = new FileRequestSender(app);
    syncRequestSender = new SyncRequestSender(app);

    changesetWorker = container.resolve<Worker>(WorkerEnum.CHANGESETS);
    fileWorker = container.resolve<Worker>(WorkerEnum.FILES);
    syncWorker = container.resolve<Worker>(WorkerEnum.SYNCS);
  }, BEFORE_ALL_TIMEOUT);

  beforeEach(function () {
    jest.resetAllMocks();
  });

  afterAll(async function () {
    const registry = depContainer.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
    await registry.trigger();
    depContainer.reset();
  });

  describe('Happy Path', function () {
    describe('POST /changeset', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeChangeset();
        const response = await changesetRequestSender.postChangeset(body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });

    describe('PATCH /changeset/{changesetId}', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeChangeset();

        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);
        const { changesetId, ...updateBody } = body;

        updateBody.osmId = faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE });

        const response = await changesetRequestSender.patchChangeset(changesetId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('PATCH /changeset/{changesetId}/entities', function () {
      it('should return 200 status code and OK body', async function () {
        const changeset = createStringifiedFakeChangeset();

        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        const response = await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('POST /changeset/closure', function () {
      it('should return 201 status code and created body', async function () {
        const response = await changesetRequestSender.postChangesetClosure([faker.string.uuid(), faker.string.uuid()]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });

      it('should return 201 status code and created body for non unique payload', async function () {
        const changesetId = faker.string.uuid();

        const response = await changesetRequestSender.postChangesetClosure([changesetId, changesetId, changesetId]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });

      it('should return 201 status code and process the job even if changeset is not found', async function () {
        const changesetId = faker.string.uuid();

        const response = await changesetRequestSender.postChangesetClosure([changesetId]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));

        const changesetClosure = await waitForJobToBeResolved(changesetWorker, changesetId);
        expect(changesetClosure?.returnValue).toMatchObject({ invokedJobCount: 0, invokedJobs: [] });
      });

      it('should return 201 status code and process the job with deduplication counter', async function () {
        const changesetId = faker.string.uuid();

        expect(await changesetRequestSender.postChangesetClosure([changesetId])).toHaveStatus(StatusCodes.CREATED);
        expect(await changesetRequestSender.postChangesetClosure([changesetId])).toHaveStatus(StatusCodes.CREATED);
        expect(await changesetRequestSender.postChangesetClosure([changesetId])).toHaveStatus(StatusCodes.CREATED);

        const changesetClosure = await waitForJobToBeResolved(changesetWorker, changesetId);
        expect(changesetClosure?.data).toMatchObject({ id: changesetId, kind: 'changeset', [DEDUPLICATION_COUNT_KEY]: 2 });
        expect(changesetClosure?.returnValue).toMatchObject({ invokedJobCount: 0, invokedJobs: [] });
      });
    });
  });

  describe('Bad Path', function () {
    describe('POST /changeset', function () {
      it('should return 400 if the changesetid is not valid', async function () {
        const body = createStringifiedFakeChangeset({ changesetId: faker.string.alphanumeric() });
        const response = await changesetRequestSender.postChangeset(body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.changesetId should match format "uuid"');
      });

      it('should return 400 if a required property is missing', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await changesetRequestSender.postChangeset(body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'changesetId'");
      });

      it('should return 409 if a chnageset already exists', async function () {
        const body = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const response = await changesetRequestSender.postChangeset(body);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('PATCH /changeset/{changesetId}', function () {
      it('should return 400 if the id is not valid', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await changesetRequestSender.patchChangeset(faker.string.alphanumeric(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.changesetId should match format "uuid"');
      });

      it('should return 400 if a osmId is not valid', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset({ osmId: faker.string.alphanumeric() });

        const response = await changesetRequestSender.patchChangeset(changesetId as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.osmId should be integer');
      });

      it('should return 404 if no changeset with the specified id was found', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await changesetRequestSender.patchChangeset(faker.string.uuid(), body);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('PATCH /changeset/{changesetId}/entities', function () {
      it('should return 400 if the id is not valid', async function () {
        const response = await changesetRequestSender.patchChangesetEntities(faker.string.alphanumeric());

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.changesetId should match format "uuid"');
      });

      it('should return 404 if no changeset with the specified id was found', async function () {
        const response = await changesetRequestSender.patchChangesetEntities(faker.string.uuid());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });
  });

  describe('Sad Path', function () {
    afterEach(async () => {
      const registry = mockDepContainer.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
      await registry.trigger();
    });

    describe('POST /changeset', function () {
      it(
        'should return 500 if the db throws an error',
        async function () {
          const createChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
          const findOneChangesetMock = jest.fn().mockResolvedValue(false);

          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
            provider: { useValue: { createChangeset: createChangesetMock, findOneChangeset: findOneChangesetMock } },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

          const response = await mockChangesetRequestSender.postChangeset(createStringifiedFakeChangeset());

          expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
          expect(response.body).toHaveProperty('message', 'failed');
        },
        LONG_RUNNING_TEST_TIMEOUT
      );
    });

    describe('PATCH /changeset/{changeset}', function () {
      it(
        'should return 500 if the db throws an error',
        async function () {
          const updateChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
          const findOneChangesetMock = jest.fn().mockResolvedValue(true);

          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
            provider: { useValue: { updateChangeset: updateChangesetMock, findOneChangeset: findOneChangesetMock } },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockChangesetRequestSender = new ChangesetRequestSender(mockApp);
          const body = createStringifiedFakeChangeset();

          expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

          const { changesetId, ...updateBody } = body;
          const response = await mockChangesetRequestSender.patchChangeset(changesetId as string, updateBody);

          expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
          expect(response.body).toHaveProperty('message', 'failed');
        },
        LONG_RUNNING_TEST_TIMEOUT
      );
    });

    describe('PATCH /changeset/{changeset}/entities', function () {
      it(
        'should return 500 if the db throws an error',
        async function () {
          const updateEntitiesOfChangesetAsCompletedMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
          const findOneChangesetMock = jest.fn().mockResolvedValue(true);

          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
            provider: {
              useValue: { updateEntitiesOfChangesetAsCompleted: updateEntitiesOfChangesetAsCompletedMock, findOneChangeset: findOneChangesetMock },
            },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockChangesetRequestSender = new ChangesetRequestSender(mockApp);
          const changeset = createStringifiedFakeChangeset();

          expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

          const { changesetId } = changeset;
          const response = await mockChangesetRequestSender.patchChangesetEntities(changesetId as string);

          expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
          expect(response.body).toHaveProperty('message', 'failed');
        },
        LONG_RUNNING_TEST_TIMEOUT
      );
    });

    describe('POST /changeset/closure', function () {
      it(
        'should return 500 if the queue throws an error',
        async function () {
          const pushMock = jest.fn().mockRejectedValue(new Error('failed'));
          const createQueueMock = jest.fn().mockImplementation((name: string) => {
            return {
              activeQueueName: `${name}-mock`,
              push: pushMock,
              close: async () => {
                await Promise.resolve();
              },
            };
          });

          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: QUEUE_PROVIDER_FACTORY,
            provider: {
              useValue: {
                createQueue: createQueueMock,
              },
            },
          });

          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          const mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

          const response = await mockChangesetRequestSender.postChangesetClosure([faker.string.uuid()]);

          expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
          expect(response.body).toHaveProperty('message', 'failed');
        },
        LONG_RUNNING_TEST_TIMEOUT
      );

      it(
        'should fail job processing due to query error',
        async function () {
          const mockError = new QueryFailedError('select *', [], new Error('failed'));
          const findFilesByChangesetsMock = jest.fn().mockRejectedValue(mockError);
          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
            provider: {
              useValue: { findFilesByChangesets: findFilesByChangesetsMock },
            },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockChangesetRequestSender = new ChangesetRequestSender(mockApp);
          const mockChangesetWorker = mockContainer.resolve<Worker>(WorkerEnum.CHANGESETS);
          const updateJobCounterSpy = jest.spyOn(queueHelpers, 'updateJobCounter');
          const delayJobSpy = jest.spyOn(queueHelpers, 'delayJob').mockImplementation(async () => Promise.resolve());

          const changesetId = faker.string.uuid();

          expect(await mockChangesetRequestSender.postChangesetClosure([changesetId])).toHaveStatus(StatusCodes.CREATED);

          const changesetClosure = await waitForJobToBeResolved(mockChangesetWorker, changesetId);

          expect(changesetClosure?.err).toMatchObject(mockError);
          expect(changesetClosure?.data[TRANSACTIONAL_FAILURE_COUNT_KEY]).toBeUndefined();
          expect(updateJobCounterSpy).not.toHaveBeenCalled();
          expect(delayJobSpy).not.toHaveBeenCalled();

          updateJobCounterSpy.mockRestore();
          delayJobSpy.mockRestore();
        },
        LONG_RUNNING_TEST_TIMEOUT
      );

      it(
        'should fail job processing due to transaction error and increase counter with each time',
        async function () {
          let eventCounter = 0;

          const transactionError = new QueryFailedError('select *', [], new Error());
          (transactionError as QueryFailedErrorWithCode).code = TransactionFailure.SERIALIZATION_FAILURE;
          const findFilesByChangesetsMock = jest.fn().mockRejectedValue(transactionError);

          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
            provider: {
              useValue: { findFilesByChangesets: findFilesByChangesetsMock },
            },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockChangesetRequestSender = new ChangesetRequestSender(mockApp);
          const mockChangesetWorker = mockContainer.resolve<Worker>(WorkerEnum.CHANGESETS);
          mockChangesetWorker.on('error', () => eventCounter++);
          mockChangesetWorker.on('failed', () => eventCounter++);
          const updateJobCounterSpy = jest.spyOn(queueHelpers, 'updateJobCounter');
          const delayJobSpy = jest.spyOn(queueHelpers, 'delayJob').mockImplementation(async () => Promise.resolve());

          const changesetId = faker.string.uuid();

          expect(await mockChangesetRequestSender.postChangesetClosure([changesetId])).toHaveStatus(StatusCodes.CREATED);

          // attempt 1
          const changesetClosure1 = await waitForJobToBeResolved(mockChangesetWorker, changesetId);

          expect(changesetClosure1?.err).toMatchObject(new DelayedError());
          expect(changesetClosure1?.data[TRANSACTIONAL_FAILURE_COUNT_KEY]).toBe(1);
          expect(updateJobCounterSpy).toHaveBeenCalledTimes(1);
          expect(delayJobSpy).toHaveBeenCalledTimes(1);

          // attempt 2
          const changesetClosure2 = await waitForJobToBeResolved(mockChangesetWorker, changesetId);

          expect(changesetClosure2?.err).toMatchObject(new DelayedError());
          expect(changesetClosure2?.data[TRANSACTIONAL_FAILURE_COUNT_KEY]).toBe(2);
          expect(updateJobCounterSpy).toHaveBeenCalledTimes(2);
          expect(delayJobSpy).toHaveBeenCalledTimes(2);

          // last fake attempt to fail the job
          await waitForJobToBeResolved(mockChangesetWorker, changesetId, (job) => {
            job.attemptsMade = 999;
            throw new Error();
          });

          expect(mockChangesetWorker.listenerCount('error')).toBe(2);
          expect(mockChangesetWorker.listenerCount('failed')).toBe(2);
          expect(eventCounter).toBe(4); // 3 errors and 1 failure

          updateJobCounterSpy.mockRestore();
          delayJobSpy.mockRestore();
        },
        LONG_RUNNING_TEST_TIMEOUT
      );
    });
  });

  describe('Flow', function () {
    it(
      'should create sync, files, entities, changeset and close it',
      async function () {
        // create a sync
        const sync = createStringifiedFakeSync({ totalFiles: 2 });
        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create two files with 6 entities overall
        const file1 = createStringifiedFakeFile({ totalEntities: 2 });
        const file2 = createStringifiedFakeFile({ totalEntities: 4 });
        expect(await fileRequestSender.postFile(sync.id as string, file1)).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFile(sync.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        // create the entities, one of them won't be synced
        const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        let file2Entities = [
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
        ];
        expect(await entityRequestSender.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
        expect(await entityRequestSender.postEntityBulk(file2.fileId as string, file2Entities)).toHaveStatus(StatusCodes.CREATED);
        file1Entities.forEach((entity) => {
          entity.fileId = file1.fileId;
        });
        file2Entities.forEach((entity) => {
          entity.fileId = file2.fileId;
        });
        const [notSyncedEntity, ...tempArr] = file2Entities;
        file2Entities = tempArr;

        // create 2 changesets
        const changeset1 = createStringifiedFakeChangeset();
        const changeset2 = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        expect(await changesetRequestSender.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);

        // patch all entities except the not synced one, the sync should not complete yet
        const patchBody = [...file1Entities, ...file2Entities].map((entity, index) => ({
          entityId: entity.entityId,
          fileId: entity.fileId,
          changesetId: index % 2 === 0 ? changeset1.changesetId : changeset2.changesetId,
        }));
        expect(await entityRequestSender.patchEntities(patchBody)).toHaveStatus(StatusCodes.OK);

        expect(await changesetRequestSender.patchChangesetEntities(changeset1.changesetId as string)).toHaveStatus(StatusCodes.OK);

        // create changeset closure
        expect(await changesetRequestSender.postChangesetClosure([changeset1.changesetId as string])).toHaveStatus(StatusCodes.CREATED);

        // get file for closure from changest
        const changeset1Closure = await waitForJobToBeResolved(changesetWorker, changeset1.changesetId as string);
        expect(changeset1Closure?.returnValue).toMatchObject({
          invokedJobCount: 2,
          invokedJobs: expect.arrayContaining([
            { kind: 'file', id: file1.fileId },
            { kind: 'file', id: file2.fileId },
          ]) as string[],
        });

        // attempt to close file1
        const file1Closure1 = await waitForJobToBeResolved(fileWorker, file1.fileId as string);
        expect(file1Closure1?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        // attempt to close file2
        const file2Closure1 = await waitForJobToBeResolved(fileWorker, file2.fileId as string);
        expect(file2Closure1?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        expect(await changesetRequestSender.patchChangesetEntities(changeset2.changesetId as string)).toHaveStatus(StatusCodes.OK);

        // create changeset closure
        expect(await changesetRequestSender.postChangesetClosure([changeset2.changesetId as string])).toHaveStatus(StatusCodes.CREATED);

        // get file for closure from changest
        const changeset2Closure = await waitForJobToBeResolved(changesetWorker, changeset2.changesetId as string);
        expect(changeset2Closure?.returnValue).toMatchObject({
          invokedJobCount: 2,
          invokedJobs: expect.arrayContaining([
            { kind: 'file', id: file1.fileId },
            { kind: 'file', id: file2.fileId },
          ]) as string[],
        });

        // get sync for closure from file
        const file1Closure2 = await waitForJobToBeResolved(fileWorker, file1.fileId as string);
        expect(file1Closure2?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [file1.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync.id }],
        });

        // attempt to close file2
        const file2Closure2 = await waitForJobToBeResolved(fileWorker, file2.fileId as string);
        expect(file2Closure2?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        // close the sync
        const syncClosure1 = await waitForJobToBeResolved(syncWorker, sync.id as string);
        expect(syncClosure1?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        // patch the not synced entity
        expect(
          await entityRequestSender.patchEntity(notSyncedEntity.fileId as string, notSyncedEntity.entityId as string, {
            status: EntityStatus.NOT_SYNCED,
          })
        ).toHaveStatus(StatusCodes.OK);

        // create file closure
        expect(await fileRequestSender.postFilesClosure([file2.fileId as string])).toHaveStatus(StatusCodes.CREATED);

        // get sync for closure from file
        const file2Closure3 = await waitForJobToBeResolved(fileWorker, file2.fileId as string);
        expect(file2Closure3?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [file2.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync.id }],
        });

        // close the sync
        const syncClosure2 = await waitForJobToBeResolved(syncWorker, sync.id as string);
        expect(syncClosure2?.returnValue).toMatchObject({ closedCount: 1, closedIds: [sync.id], invokedJobCount: 0, invokedJobs: [] });

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveStatus(StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      LONG_RUNNING_TEST_TIMEOUT
    );

    it(
      'should create sync, files, entities, changeset and close it by closing the entities and then the changeset',
      async function () {
        // create a sync
        const sync = createStringifiedFakeSync({ totalFiles: 2 });
        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create two files with 6 entities overall
        const file1 = createStringifiedFakeFile({ totalEntities: 2 });
        const file2 = createStringifiedFakeFile({ totalEntities: 4 });
        expect(await fileRequestSender.postFile(sync.id as string, file1)).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFile(sync.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        // create the entities, one of them won't be synced
        const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        let file2Entities = [
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
        ];
        expect(await entityRequestSender.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
        expect(await entityRequestSender.postEntityBulk(file2.fileId as string, file2Entities)).toHaveStatus(StatusCodes.CREATED);
        file1Entities.forEach((entity) => {
          entity.fileId = file1.fileId;
        });
        file2Entities.forEach((entity) => {
          entity.fileId = file2.fileId;
        });
        const [notSyncedEntity, ...tempArr] = file2Entities;
        file2Entities = tempArr;

        // create 2 changesets
        const changeset1 = createStringifiedFakeChangeset();
        const changeset2 = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);
        expect(await changesetRequestSender.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);

        // patch all entities except the not synced one, the sync should not complete yet
        const patchBody = [...file1Entities, ...file2Entities].map((entity, index) => ({
          entityId: entity.entityId,
          fileId: entity.fileId,
          changesetId: index % 2 === 0 ? changeset1.changesetId : changeset2.changesetId,
        }));
        expect(await entityRequestSender.patchEntities(patchBody)).toHaveStatus(StatusCodes.OK);

        expect(await changesetRequestSender.patchChangesetEntities(changeset1.changesetId as string)).toHaveStatus(StatusCodes.OK);

        // post changesets closure
        expect(await changesetRequestSender.postChangesetClosure([changeset1.changesetId as string, changeset2.changesetId as string])).toHaveStatus(
          StatusCodes.CREATED
        );

        // get file for closure from changest
        const batchId = hashBatch([changeset1.changesetId as string, changeset2.changesetId as string]);
        const changesetBatchClosure1 = await waitForJobToBeResolved(changesetWorker, batchId);
        expect(changesetBatchClosure1?.returnValue).toMatchObject({
          invokedJobCount: 2,
          invokedJobs: expect.arrayContaining([
            { kind: 'file', id: file1.fileId },
            { kind: 'file', id: file2.fileId },
          ]) as string[],
        });

        // attempt to close file1
        const file1Closure1 = await waitForJobToBeResolved(fileWorker, file1.fileId as string);
        expect(file1Closure1?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        // attempt to close file2
        const file2Closure1 = await waitForJobToBeResolved(fileWorker, file2.fileId as string);
        expect(file2Closure1?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch the not synced entity should complete the sync
        expect(
          await entityRequestSender.patchEntity(notSyncedEntity.fileId as string, notSyncedEntity.entityId as string, {
            status: EntityStatus.NOT_SYNCED,
          })
        ).toHaveStatus(StatusCodes.OK);

        expect(await fileRequestSender.postFilesClosure([notSyncedEntity.fileId as string])).toHaveStatus(StatusCodes.CREATED);

        // attempt to close the file
        const fileClosure = await waitForJobToBeResolved(fileWorker, notSyncedEntity.fileId as string);
        expect(fileClosure?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        expect(await changesetRequestSender.patchChangesetEntities(changeset2.changesetId as string)).toHaveStatus(StatusCodes.OK);

        // post changesets closure
        expect(await changesetRequestSender.postChangesetClosure([changeset1.changesetId as string, changeset2.changesetId as string])).toHaveStatus(
          StatusCodes.CREATED
        );

        const changesetBatchClosure2 = await waitForJobToBeResolved(changesetWorker, batchId);
        expect(changesetBatchClosure2?.returnValue).toMatchObject({
          invokedJobCount: 2,
          invokedJobs: expect.arrayContaining([
            { kind: 'file', id: file1.fileId },
            { kind: 'file', id: file2.fileId },
          ]) as string[],
        });

        // close file1
        const file1Closure2 = await waitForJobToBeResolved(fileWorker, file1.fileId as string);
        expect(file1Closure2?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [file1.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync.id }],
        });

        // close file2
        const file2Closure2 = await waitForJobToBeResolved(fileWorker, file2.fileId as string);
        expect(file2Closure2?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [file2.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync.id }],
        });

        // close the sync
        const syncClosure = await waitForJobToBeResolved(syncWorker, sync.id as string);
        expect(syncClosure?.returnValue).toMatchObject({ closedCount: 1, closedIds: [sync.id], invokedJobCount: 0, invokedJobs: [] });
        expect(syncClosure?.data).toMatchObject({ id: sync.id, kind: 'sync', [DEDUPLICATION_COUNT_KEY]: 1 });

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveStatus(StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      LONG_RUNNING_TEST_TIMEOUT
    );

    it(
      'should create a sync with not synced entity that should complete the file and the sync',
      async function () {
        // create sync
        const sync = createStringifiedFakeSync({ totalFiles: 1 });
        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create file with 2 entities
        const file = createStringifiedFakeFile({ totalEntities: 2 });
        expect(await fileRequestSender.postFile(sync.id as string, file)).toHaveStatus(StatusCodes.CREATED);

        // create entities, one will be synced the other won't
        const fileEntities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        expect(await entityRequestSender.postEntityBulk(file.fileId as string, fileEntities)).toHaveStatus(StatusCodes.CREATED);

        fileEntities.forEach((entity) => {
          entity.fileId = file.fileId;
        });

        const [notSyncedEntity, syncedEntity] = fileEntities;

        // create changeset
        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        // patch the first entity, the sync shouldn't complete
        expect(
          await entityRequestSender.patchEntity(syncedEntity.fileId as string, syncedEntity.entityId as string, {
            changesetId: changeset.changesetId as string,
          })
        ).toHaveStatus(StatusCodes.OK);

        expect(await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await changesetRequestSender.postChangesetClosure([changeset.changesetId as string])).toHaveStatus(StatusCodes.CREATED);

        const changesetClosure = await waitForJobToBeResolved(changesetWorker, changeset.changesetId as string);
        expect(changesetClosure?.returnValue).toMatchObject({ invokedJobCount: 1, invokedJobs: [{ kind: 'file', id: file.fileId }] });

        const file1Closure = await waitForJobToBeResolved(fileWorker, file.fileId as string);
        expect(file1Closure?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch the other entity as not synced should complete the whole sync
        expect(
          await entityRequestSender.patchEntity(file.fileId as string, notSyncedEntity.entityId as string, {
            status: EntityStatus.NOT_SYNCED,
          })
        ).toHaveStatus(StatusCodes.OK);

        expect(await fileRequestSender.postFilesClosure([notSyncedEntity.fileId as string])).toHaveStatus(StatusCodes.CREATED);

        // close the file
        const fileClosure = await waitForJobToBeResolved(fileWorker, notSyncedEntity.fileId as string);
        expect(fileClosure?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [notSyncedEntity.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync.id }],
        });

        // close the sync
        const syncClosure = await waitForJobToBeResolved(syncWorker, sync.id as string);
        expect(syncClosure?.returnValue).toMatchObject({ closedCount: 1, closedIds: [sync.id], invokedJobCount: 0, invokedJobs: [] });

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveStatus(StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      LONG_RUNNING_TEST_TIMEOUT
    );

    it(
      'should create a sync with not synced entity that should only complete the file but not the whole sync',
      async function () {
        // create sync
        const sync = createStringifiedFakeSync({ totalFiles: 2 });

        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create 2 files
        const file1 = createStringifiedFakeFile({ totalEntities: 2 });
        const file2 = createStringifiedFakeFile({ totalEntities: 1 });

        expect(await fileRequestSender.postFile(sync.id as string, file1)).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFile(sync.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        // create 3 entities, file 1 entities will be synced and not synced, file2 entity will be synced last
        const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        const file2Entity = createStringifiedFakeEntity();

        expect(await entityRequestSender.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
        expect(await entityRequestSender.postEntity(file2.fileId as string, file2Entity)).toHaveStatus(StatusCodes.CREATED);

        file1Entities.forEach((entity) => {
          entity.fileId = file1.fileId;
        });

        const [notSyncedEntity, syncedEntity] = file1Entities;

        // create changeset
        const changeset = createStringifiedFakeChangeset();

        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        // patch first synced entity of file1
        expect(
          await entityRequestSender.patchEntity(syncedEntity.fileId as string, syncedEntity.entityId as string, {
            changesetId: changeset.changesetId as string,
          })
        ).toHaveStatus(StatusCodes.OK);

        expect(await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        // post changesets closure
        expect(await changesetRequestSender.postChangesetClosure([changeset.changesetId as string])).toHaveStatus(StatusCodes.CREATED);

        // get file for closure from changest
        const changesetClosure1 = await waitForJobToBeResolved(changesetWorker, changeset.changesetId as string);
        expect(changesetClosure1?.returnValue).toMatchObject({ invokedJobCount: 1, invokedJobs: [{ kind: 'file', id: file1.fileId }] });

        // attempt to close file1
        const file1Closure1 = await waitForJobToBeResolved(fileWorker, file1.fileId as string);
        expect(file1Closure1?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch second not synced entity of file1. will close the file but not the sync
        expect(
          await entityRequestSender.patchEntity(file1.fileId as string, notSyncedEntity.entityId as string, {
            status: EntityStatus.NOT_SYNCED,
          })
        ).toHaveStatus(StatusCodes.OK);

        expect(await fileRequestSender.postFilesClosure([file1.fileId as string])).toHaveStatus(StatusCodes.CREATED);

        const fileClosure = await waitForJobToBeResolved(fileWorker, file1.fileId as string);
        expect(fileClosure?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [file1.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync.id }],
        });

        const syncClosure = await waitForJobToBeResolved(syncWorker, sync.id as string);
        expect(syncClosure?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch the last entity, should close the sync
        expect(
          await entityRequestSender.patchEntity(file2.fileId as string, file2Entity.entityId as string, {
            changesetId: changeset.changesetId as string,
          })
        ).toHaveStatus(StatusCodes.OK);

        expect(await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await fileRequestSender.postFilesClosure([file2.fileId as string])).toHaveStatus(StatusCodes.CREATED);

        const fileClosure2 = await waitForJobToBeResolved(fileWorker, file2.fileId as string);
        expect(fileClosure2?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [file2.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync.id }],
        });

        const syncClosure2 = await waitForJobToBeResolved(syncWorker, sync.id as string);
        expect(syncClosure2?.returnValue).toMatchObject({ closedCount: 1, closedIds: [sync.id], invokedJobCount: 0, invokedJobs: [] });

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveProperty('status', StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      LONG_RUNNING_TEST_TIMEOUT
    );

    it(
      'should create two syncs and close them in the same changeset',
      async function () {
        // create 2 syncs
        const sync1 = createStringifiedFakeSync({ totalFiles: 1, isFull: false });
        const sync2 = createStringifiedFakeSync({ totalFiles: 1, isFull: false });

        expect(await syncRequestSender.postSync(sync1)).toHaveStatus(StatusCodes.CREATED);
        expect(await syncRequestSender.postSync(sync2)).toHaveStatus(StatusCodes.CREATED);

        // create 2 files
        const file1 = createStringifiedFakeFile({ totalEntities: 2 });
        const file2 = createStringifiedFakeFile({ totalEntities: 1 });

        expect(await fileRequestSender.postFile(sync1.id as string, file1)).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFile(sync2.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        // create 3 entities
        const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        const file2Entity = createStringifiedFakeEntity();

        expect(await entityRequestSender.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
        expect(await entityRequestSender.postEntity(file2.fileId as string, file2Entity)).toHaveStatus(StatusCodes.CREATED);

        file1Entities[0].fileId = file1.fileId;
        file1Entities[1].fileId = file1.fileId;
        file2Entity.fileId = file2.fileId;

        // create changeset
        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        // patch all entities of both syncs to have the same changeset
        const patchBody = [...file1Entities, file2Entity].map((entity) => ({
          entityId: entity.entityId,
          fileId: entity.fileId,
          changesetId: changeset.changesetId,
        }));
        expect(await entityRequestSender.patchEntities(patchBody)).toHaveStatus(StatusCodes.OK);

        expect(await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await changesetRequestSender.postChangesetClosure([changeset.changesetId as string])).toHaveStatus(StatusCodes.CREATED);

        const changesetClosure = await waitForJobToBeResolved(changesetWorker, changeset.changesetId as string);
        expect(changesetClosure?.returnValue).toMatchObject({
          invokedJobCount: 2,
          invokedJobs: expect.arrayContaining([
            { kind: 'file', id: file1.fileId },
            { kind: 'file', id: file2.fileId },
          ]) as string[],
        });

        // close file1
        const file1Closure2 = await waitForJobToBeResolved(fileWorker, file1.fileId as string);
        expect(file1Closure2?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [file1.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync1.id }],
        });

        // close file2
        const file2Closure2 = await waitForJobToBeResolved(fileWorker, file2.fileId as string);
        expect(file2Closure2?.returnValue).toMatchObject({
          closedCount: 1,
          closedIds: [file2.fileId],
          invokedJobCount: 1,
          invokedJobs: [{ kind: 'sync', id: sync2.id }],
        });

        // close sync1
        const sync1Closure = await waitForJobToBeResolved(syncWorker, sync1.id as string);
        expect(sync1Closure?.returnValue).toMatchObject({ closedCount: 1, closedIds: [sync1.id], invokedJobCount: 0, invokedJobs: [] });

        // close sync2
        const sync2Closure = await waitForJobToBeResolved(syncWorker, sync2.id as string);
        expect(sync2Closure?.returnValue).toMatchObject({ closedCount: 1, closedIds: [sync2.id], invokedJobCount: 0, invokedJobs: [] });

        const latestSyncLayer1Response = await syncRequestSender.getLatestSync(sync1.layerId as number, sync1.geometryType as GeometryType);
        const latestSyncLayer2Response = await syncRequestSender.getLatestSync(sync2.layerId as number, sync2.geometryType as GeometryType);

        expect(latestSyncLayer1Response).toHaveProperty('status', StatusCodes.OK);
        expect(latestSyncLayer1Response).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncLayer1Response).toHaveProperty('body.endDate');
        expect((latestSyncLayer1Response.body as Sync).endDate).not.toBeNull();

        expect(latestSyncLayer2Response).toHaveProperty('status', StatusCodes.OK);
        expect(latestSyncLayer2Response).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncLayer2Response).toHaveProperty('body.endDate');
        expect((latestSyncLayer2Response.body as Sync).endDate).not.toBeNull();
      },
      LONG_RUNNING_TEST_TIMEOUT
    );
  });
});
