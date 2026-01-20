import httpStatus, { StatusCodes } from 'http-status-codes';
import { DependencyContainer } from 'tsyringe';
import { faker } from '@faker-js/faker';
import { QueryFailedError } from 'typeorm';
import { DelayedError, Worker } from 'bullmq';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { getApp } from '../../../src/app';
import { createStringifiedFakeRerunCreateBody, createStringifiedFakeSync } from '../sync/helpers/generators';
import { StringifiedSync } from '../sync/types';
import { FileRequestSender } from '../file/helpers/requestSender';
import { SERVICES } from '../../../src/common/constants';
import { SyncRequestSender } from '../sync/helpers/requestSender';
import { BEFORE_ALL_TIMEOUT, getBaseRegisterOptions, LONG_RUNNING_TEST_TIMEOUT, RERUN_TEST_TIMEOUT, waitForJobToBeResolved } from '../helpers';
import { Status } from '../../../src/common/enums';
import { FILE_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/file/DAL/fileRepository';
import { SYNC_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/sync/DAL/syncRepository';
import { QUEUE_PROVIDER_FACTORY, WorkerEnum } from '../../../src/queueProvider/constants';
import { TRANSACTIONAL_FAILURE_COUNT_KEY } from '../../../src/queueProvider/helpers';
import { QueryFailedErrorWithCode, TransactionFailure } from '../../../src/common/db/transactions';
import * as queueHelpers from '../../../src/queueProvider/helpers';
import { createStringifiedFakeEntity } from '../entity/helpers/generators';
import { EntityRequestSender } from '../entity/helpers/requestSender';
import { FilesWorker } from '../../../src/queueProvider/workers';
import { createStringifiedFakeFile } from './helpers/generators';

jest.mock('../../../src/queueProvider/helpers', (): object => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('../../../src/queueProvider/helpers'),
  };
});

describe('file', function () {
  let fileRequestSender: FileRequestSender;
  let syncRequestSender: SyncRequestSender;
  let entityRequestSender: EntityRequestSender;
  let mockFileRequestSender: FileRequestSender;

  let sync: StringifiedSync;

  let filesWorker: FilesWorker;

  let depContainer: DependencyContainer;
  let mockDepContainer: DependencyContainer;

  beforeAll(async function () {
    const { app, container } = await getApp(getBaseRegisterOptions());
    depContainer = container;
    fileRequestSender = new FileRequestSender(app);
    syncRequestSender = new SyncRequestSender(app);
    entityRequestSender = new EntityRequestSender(app);

    sync = createStringifiedFakeSync();
    await syncRequestSender.postSync(sync);

    filesWorker = container.resolve<FilesWorker>(WorkerEnum.FILES);
    filesWorker['createWorker']();
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
    describe('POST /sync/:syncId/file', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeFile();
        const response = await fileRequestSender.postFile(sync.id as string, body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });

      it(
        'should return 201 status code for creating a file on a rerun while existing on its base',
        async function () {
          const syncForRerun = createStringifiedFakeSync({ isFull: false, totalFiles: 2 });
          const file = createStringifiedFakeFile();
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: false });

          expect(await syncRequestSender.postSync(syncForRerun)).toHaveStatus(StatusCodes.CREATED);
          expect(await fileRequestSender.postFile(syncForRerun.id as string, file)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(syncForRerun.id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(syncForRerun.id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          const response = await fileRequestSender.postFile(rerunCreateBody.rerunId as string, file);

          expect(response).toHaveProperty('status', StatusCodes.CREATED);
          expect(response.text).toBe(httpStatus.getStatusText(StatusCodes.CREATED));
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 201 status code for creating a file on a rerun while not existing on its base',
        async function () {
          const syncForRerun = createStringifiedFakeSync();
          const file = createStringifiedFakeFile();
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });

          expect(await syncRequestSender.postSync(syncForRerun)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(syncForRerun.id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(syncForRerun.id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          const response = await fileRequestSender.postFile(rerunCreateBody.rerunId as string, file);

          expect(response).toHaveProperty('status', StatusCodes.CREATED);
          expect(response.text).toBe(httpStatus.getStatusText(StatusCodes.CREATED));
        },
        RERUN_TEST_TIMEOUT
      );
    });

    describe('POST /sync/:syncId/file/_bulk', function () {
      it('should return 200 status code and OK body', async function () {
        const response = await fileRequestSender.postFileBulk(sync.id as string, [createStringifiedFakeFile(), createStringifiedFakeFile()]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });

    describe('PATCH /sync/:syncId/file/:fileId', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeFile();
        await fileRequestSender.postFile(sync.id as string, body);

        const patchResponse = await fileRequestSender.patchFile(sync.id as string, body.fileId as string, { totalEntities: 0 });

        expect(patchResponse.status).toBe(httpStatus.OK);
        expect(patchResponse.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('POST /file/closure', function () {
      it('should return 201 status code and created body', async function () {
        const response = await fileRequestSender.postFilesClosure([faker.string.uuid(), faker.string.uuid()]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });

      it('should return 201 status code and created body for non unique payload', async function () {
        const fileId = faker.string.uuid();

        const response = await fileRequestSender.postFilesClosure([fileId, fileId, fileId]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });

      it('should return 201 status code and process the job even if file is not found', async function () {
        const fileId = faker.string.uuid();

        const response = await fileRequestSender.postFilesClosure([fileId]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));

        const fileClosure = await waitForJobToBeResolved(filesWorker['worker'] as Worker, fileId);
        expect(fileClosure?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });
      });

      it('should return 201 status code and process the job with deduplication counter', async function () {
        const fileId = faker.string.uuid();

        expect(await fileRequestSender.postFilesClosure([fileId])).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFilesClosure([fileId])).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFilesClosure([fileId])).toHaveStatus(StatusCodes.CREATED);

        const fileClosure = await waitForJobToBeResolved(filesWorker['worker'] as Worker, fileId);
        expect(fileClosure?.data).toMatchObject({ id: fileId, kind: 'file', [queueHelpers.DEDUPLICATION_COUNT_KEY]: 2 });
        expect(fileClosure?.returnValue).toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });
      });
    });
  });

  describe('Bad Path', function () {
    describe('POST /sync/:syncId/file', function () {
      it('should return 400 if the syncId is not valid', async function () {
        const body = createStringifiedFakeFile();

        const response = await fileRequestSender.postFile(faker.string.alphanumeric(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.syncId should match format "uuid"');
      });

      it('should return 400 if a required property is missing', async function () {
        const { startDate, ...body } = createStringifiedFakeFile();

        const response = await fileRequestSender.postFile(sync.id as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'startDate'");
      });

      it('should return 404 if the sync was not found', async function () {
        const uuid = faker.string.uuid();
        const response = await fileRequestSender.postFile(uuid, createStringifiedFakeFile());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
        expect(response.body).toHaveProperty('message', `sync = ${uuid} not found`);
      });

      it('should return 409 if a file already exists', async function () {
        const file = createStringifiedFakeFile();
        expect(await fileRequestSender.postFile(sync.id as string, file)).toHaveStatus(StatusCodes.CREATED);

        const response = await fileRequestSender.postFile(sync.id as string, file);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });

      it(
        'should return 409 if on a rerun a file has conflicting sync id with already existing file',
        async function () {
          const sync = createStringifiedFakeSync();
          const syncForRerun = createStringifiedFakeSync();
          const file = createStringifiedFakeFile();
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });

          expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);
          expect(await fileRequestSender.postFile(sync.id as string, file)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.postSync(syncForRerun)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(syncForRerun.id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(syncForRerun.id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          const response = await fileRequestSender.postFile(rerunCreateBody.rerunId as string, file);

          expect(response).toHaveProperty('status', StatusCodes.CONFLICT);
          expect(response.body).toHaveProperty('message', `rerun file = ${file.fileId as string} conflicting sync id`);
        },
        RERUN_TEST_TIMEOUT
      );

      it(
        'should return 409 if on a rerun a file has conflicting total entities value with already existing file',
        async function () {
          const syncForRerun = createStringifiedFakeSync({ isFull: false });
          const file = createStringifiedFakeFile();
          const entity = createStringifiedFakeEntity();
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });

          expect(await syncRequestSender.postSync(syncForRerun)).toHaveStatus(StatusCodes.CREATED);
          expect(await fileRequestSender.postFile(syncForRerun.id as string, file)).toHaveStatus(StatusCodes.CREATED);
          expect(await entityRequestSender.postEntityBulk(file.fileId as string, [entity])).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(syncForRerun.id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(syncForRerun.id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          const response = await fileRequestSender.postFile(rerunCreateBody.rerunId as string, {
            ...file,
            totalEntities: (file.totalEntities as number) + 1,
          });

          expect(response).toHaveProperty('status', StatusCodes.CONFLICT);
          expect(response.body).toHaveProperty('message', `rerun file = ${file.fileId as string} conflicting total entities`);
        },
        RERUN_TEST_TIMEOUT
      );
    });

    describe('POST /sync/:syncId/file/_bulk', function () {
      it('should return 400 if the sync id is not valid', async function () {
        const body = createStringifiedFakeFile();

        const response = await fileRequestSender.postFileBulk(faker.string.alphanumeric(), [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.syncId should match format "uuid"');
      });

      it('should return 400 if a date is not valid', async function () {
        const body = createStringifiedFakeFile({ startDate: faker.string.alphanumeric() });

        const response = await fileRequestSender.postFileBulk(sync.id as string, [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body[0].startDate should match format "date-time"');
      });

      it('should return 404 if no sync with the specified sync id was found', async function () {
        const body = createStringifiedFakeFile();

        const response = await fileRequestSender.postFileBulk(faker.string.uuid(), [body]);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 409 if one of the file is duplicate', async function () {
        const file = createStringifiedFakeFile();

        const response = await fileRequestSender.postFileBulk(sync.id as string, [file, file]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });

      it('should return 409 if a file already exists', async function () {
        const file = createStringifiedFakeFile();
        const file2 = createStringifiedFakeFile();

        expect(await fileRequestSender.postFile(sync.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        const response = await fileRequestSender.postFileBulk(sync.id as string, [file, file2]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('PATCH /sync/:syncId/file/:fileId', function () {
      it('should return 404 if no sync with the specified sync id was found', async function () {
        const body = createStringifiedFakeFile();

        const patchResponse = await fileRequestSender.patchFile(sync.id as string, body.fileId as string, { totalEntities: 0 });

        expect(patchResponse.status).toBe(httpStatus.NOT_FOUND);
      });

      it('should return 404 if no file with the specified file id was found', async function () {
        const body = createStringifiedFakeFile();
        await fileRequestSender.postFile(sync.id as string, body);

        const patchResponse = await fileRequestSender.patchFile(sync.id as string, faker.string.uuid(), { totalEntities: 0 });

        expect(patchResponse.status).toBe(httpStatus.NOT_FOUND);
      });
    });
  });

  describe('Sad Path', function () {
    afterEach(async () => {
      const registry = mockDepContainer.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
      await registry.trigger();
    });

    describe('POST /sync/:syncId/file', function () {
      it(
        'should return 500 if the db throws an error',
        async function () {
          const createFileMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
          const findOneFileMock = jest.fn().mockResolvedValue(false);

          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: FILE_CUSTOM_REPOSITORY_SYMBOL,
            provider: { useValue: { createFile: createFileMock, findOneFile: findOneFileMock } },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockFileRequestSender = new FileRequestSender(mockApp);

          const response = await mockFileRequestSender.postFile(sync.id as string, createStringifiedFakeFile());

          expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
          expect(response.body).toHaveProperty('message', 'failed');
        },
        LONG_RUNNING_TEST_TIMEOUT
      );
    });

    describe('POST /sync/:syncId/file/_bulk', function () {
      it(
        'should return 500 if the db throws an error',
        async function () {
          const createFilesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
          const findManyFilesByIdsMock = jest.fn().mockResolvedValue(false);

          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: FILE_CUSTOM_REPOSITORY_SYMBOL,
            provider: { useValue: { createFiles: createFilesMock, findManyFilesByIds: findManyFilesByIdsMock } },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockFileRequestSender = new FileRequestSender(mockApp);

          const body = createStringifiedFakeFile();

          const response = await mockFileRequestSender.postFileBulk(sync.id as string, [body]);

          expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
          expect(response.body).toHaveProperty('message', 'failed');
        },
        LONG_RUNNING_TEST_TIMEOUT
      );
    });

    describe('PATCH /sync/:syncId/file/:fileId', function () {
      it(
        'should return 500 if the db throws an error',
        async function () {
          const updateFileMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
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
                updateFile: updateFileMock,
              },
            },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          const mockFileRequestSender = new FileRequestSender(mockApp);
          const { fileId, totalEntities } = createStringifiedFakeFile();

          const response = await mockFileRequestSender.patchFile(faker.string.uuid(), fileId as string, { totalEntities });

          expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
          expect(response.body).toHaveProperty('message', 'failed');
        },
        LONG_RUNNING_TEST_TIMEOUT
      );
    });

    describe('POST /file/closure', function () {
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
          const mockFileRequestSender = new FileRequestSender(mockApp);

          const response = await mockFileRequestSender.postFilesClosure([faker.string.uuid()]);

          expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
          expect(response.body).toHaveProperty('message', 'failed');
        },
        LONG_RUNNING_TEST_TIMEOUT
      );

      it(
        'should fail job processing due to query error',
        async function () {
          const mockError = new QueryFailedError('select *', [], new Error('failed'));
          const attemptFileClosureMock = jest.fn().mockRejectedValue(mockError);
          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: FILE_CUSTOM_REPOSITORY_SYMBOL,
            provider: {
              useValue: { attemptFileClosure: attemptFileClosureMock },
            },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockFileRequestSender = new FileRequestSender(mockApp);
          const mockFilesWorker = mockContainer.resolve<FilesWorker>(WorkerEnum.FILES);
          mockFilesWorker['createWorker']();
          const updateJobCounterSpy = jest.spyOn(queueHelpers, 'updateJobCounter');
          const delayJobSpy = jest.spyOn(queueHelpers, 'delayJob').mockImplementation(async () => Promise.resolve());

          const fileId = faker.string.uuid();

          expect(await mockFileRequestSender.postFilesClosure([fileId])).toHaveStatus(StatusCodes.CREATED);

          const fileClosure = await waitForJobToBeResolved(mockFilesWorker['worker'] as Worker, fileId);

          expect(fileClosure?.err).toMatchObject(mockError);
          expect(fileClosure?.data[TRANSACTIONAL_FAILURE_COUNT_KEY]).toBeUndefined();
          expect(updateJobCounterSpy).not.toHaveBeenCalled();
          expect(delayJobSpy).not.toHaveBeenCalled();

          updateJobCounterSpy.mockRestore();
          delayJobSpy.mockRestore();
          await mockFilesWorker.close();
        },
        LONG_RUNNING_TEST_TIMEOUT
      );

      it(
        'should fail job processing due to transaction error and increase counter with each time',
        async function () {
          let eventCounter = 0;

          const transactionError = new QueryFailedError('select *', [], new Error());
          (transactionError as QueryFailedErrorWithCode).code = TransactionFailure.SERIALIZATION_FAILURE;
          const attemptFileClosureMock = jest.fn().mockRejectedValue(transactionError);

          const mockRegisterOptions = getBaseRegisterOptions();
          mockRegisterOptions.override.push({
            token: FILE_CUSTOM_REPOSITORY_SYMBOL,
            provider: {
              useValue: { attemptFileClosure: attemptFileClosureMock },
            },
          });
          const { app: mockApp, container: mockContainer } = await getApp(mockRegisterOptions);
          mockDepContainer = mockContainer;
          mockFileRequestSender = new FileRequestSender(mockApp);
          const mockFilesWorker = mockContainer.resolve<FilesWorker>(WorkerEnum.FILES);
          mockFilesWorker['createWorker']();
          (mockFilesWorker['worker'] as Worker).on('error', () => eventCounter++);
          (mockFilesWorker['worker'] as Worker).on('failed', () => eventCounter++);
          const updateJobCounterSpy = jest.spyOn(queueHelpers, 'updateJobCounter');
          const delayJobSpy = jest.spyOn(queueHelpers, 'delayJob').mockImplementation(async () => Promise.resolve());

          const fileId = faker.string.uuid();

          expect(await mockFileRequestSender.postFilesClosure([fileId])).toHaveStatus(StatusCodes.CREATED);

          // attempt 1
          const fileClosure1 = await waitForJobToBeResolved(mockFilesWorker['worker'] as Worker, fileId);

          expect(fileClosure1?.err).toMatchObject(new DelayedError());
          expect(fileClosure1?.data[TRANSACTIONAL_FAILURE_COUNT_KEY]).toBe(1);
          expect(updateJobCounterSpy).toHaveBeenCalledTimes(1);
          expect(delayJobSpy).toHaveBeenCalledTimes(1);

          // attempt 2
          const fileClosure2 = await waitForJobToBeResolved(mockFilesWorker['worker'] as Worker, fileId);

          expect(fileClosure2?.err).toMatchObject(new DelayedError());
          expect(fileClosure2?.data[TRANSACTIONAL_FAILURE_COUNT_KEY]).toBe(2);
          expect(updateJobCounterSpy).toHaveBeenCalledTimes(2);
          expect(delayJobSpy).toHaveBeenCalledTimes(2);

          // last fake attempt to fail the job
          await waitForJobToBeResolved(mockFilesWorker['worker'] as Worker, fileId, (job) => {
            job.attemptsMade = 999;
            throw new Error();
          });

          expect((mockFilesWorker['worker'] as Worker).listenerCount('error')).toBe(2);
          expect((mockFilesWorker['worker'] as Worker).listenerCount('failed')).toBe(2);
          expect(eventCounter).toBe(4); // 3 errors and 1 failure

          updateJobCounterSpy.mockRestore();
          delayJobSpy.mockRestore();
          await mockFilesWorker.close();
        },
        LONG_RUNNING_TEST_TIMEOUT
      );
    });
  });
});
