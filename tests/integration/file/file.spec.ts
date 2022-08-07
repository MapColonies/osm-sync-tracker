import httpStatus, { StatusCodes } from 'http-status-codes';
import { DependencyContainer } from 'tsyringe';
import { faker } from '@faker-js/faker';
import { DataSource, QueryFailedError } from 'typeorm';
import { getApp } from '../../../src/app';
import { createStringifiedFakeRerunCreateBody, createStringifiedFakeSync } from '../sync/helpers/generators';
import { StringifiedSync } from '../sync/types';
import { FileRequestSender } from '../file/helpers/requestSender';
import { SyncRequestSender } from '../sync/helpers/requestSender';
import { BEFORE_ALL_TIMEOUT, getBaseRegisterOptions, RERUN_TEST_TIMEOUT } from '../helpers';
import { Status } from '../../../src/common/enums';
import { FILE_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/file/DAL/fileRepository';
import { createStringifiedFakeEntity } from '../entity/helpers/generators';
import { EntityRequestSender } from '../entity/helpers/requestSender';
import { createStringifiedFakeFile } from './helpers/generators';

describe('file', function () {
  let fileRequestSender: FileRequestSender;
  let syncRequestSender: SyncRequestSender;
  let entityRequestSender: EntityRequestSender;
  let mockFileRequestSender: FileRequestSender;

  let sync: StringifiedSync;

  let depContainer: DependencyContainer;

  beforeAll(async function () {
    const { app, container } = await getApp(getBaseRegisterOptions());
    depContainer = container;
    fileRequestSender = new FileRequestSender(app);
    syncRequestSender = new SyncRequestSender(app);
    entityRequestSender = new EntityRequestSender(app);

    sync = createStringifiedFakeSync();
    await syncRequestSender.postSync(sync);
  }, BEFORE_ALL_TIMEOUT);

  afterAll(async function () {
    const connection = depContainer.resolve(DataSource);
    await connection.destroy();
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
  });

  describe('Bad Path', function () {
    describe('POST /sync/:syncId/file', function () {
      it('should return 400 if the syncId is not valid', async function () {
        const body = createStringifiedFakeFile();

        const response = await fileRequestSender.postFile(faker.random.word(), body);

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
        const uuid = faker.datatype.uuid();
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

        const response = await fileRequestSender.postFileBulk(faker.random.word(), [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.syncId should match format "uuid"');
      });

      it('should return 400 if a date is not valid', async function () {
        const body = createStringifiedFakeFile({ startDate: faker.random.word() });

        const response = await fileRequestSender.postFileBulk(sync.id as string, [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body[0].startDate should match format "date-time"');
      });

      it('should return 404 if no sync with the specified sync id was found', async function () {
        const body = createStringifiedFakeFile();

        const response = await fileRequestSender.postFileBulk(faker.datatype.uuid(), [body]);

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
  });

  describe('Sad Path', function () {
    describe('POST /sync/:syncId/file', function () {
      it('should return 500 if the db throws an error', async function () {
        const createFileMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneFileMock = jest.fn().mockResolvedValue(false);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: FILE_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { createFile: createFileMock, findOneFile: findOneFileMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockFileRequestSender = new FileRequestSender(mockApp);

        const response = await mockFileRequestSender.postFile(sync.id as string, createStringifiedFakeFile());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('POST /sync/:syncId/file/_bulk', function () {
      it('should return 500 if the db throws an error', async function () {
        const createFilesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findManyFilesMock = jest.fn().mockResolvedValue(false);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: FILE_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { createFiles: createFilesMock, findManyFiles: findManyFilesMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockFileRequestSender = new FileRequestSender(mockApp);

        const body = createStringifiedFakeFile();

        const response = await mockFileRequestSender.postFileBulk(sync.id as string, [body]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });
});
