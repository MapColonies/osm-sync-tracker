import httpStatus, { StatusCodes } from 'http-status-codes';
import { container } from 'tsyringe';
import faker from 'faker';
import { Connection, QueryFailedError } from 'typeorm';
import { getApp } from '../../../src/app';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { StringifiedSync } from '../sync/types';
import { FileRequestSender } from '../file/helpers/requestSender';
import { SyncRequestSender } from '../sync/helpers/requestSender';
import { getBaseRegisterOptions } from '../helpers';
import { fileRepositorySymbol } from '../../../src/file/DAL/fileRepository';
import { createStringifiedFakeFile } from './helpers/generators';

describe('file', function () {
  let fileRequestSender: FileRequestSender;
  let syncRequestSender: SyncRequestSender;
  let mockFileRequestSender: FileRequestSender;

  let sync: StringifiedSync;

  beforeAll(async function () {
    const app = await getApp(getBaseRegisterOptions());
    fileRequestSender = new FileRequestSender(app);
    syncRequestSender = new SyncRequestSender(app);

    sync = createStringifiedFakeSync();
    await syncRequestSender.postSync(sync);
  }, 15000);

  afterAll(async function () {
    const connection = container.resolve(Connection);
    await connection.close();
    container.reset();
  });

  describe('Happy Path', function () {
    describe('POST /sync/:syncId/file', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeFile();
        const response = await fileRequestSender.postFile(sync.id as string, body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
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
          token: fileRepositorySymbol,
          provider: { useValue: { createFile: createFileMock, findOneFile: findOneFileMock } },
        });
        const mockApp = await getApp(mockRegisterOptions);
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
          token: fileRepositorySymbol,
          provider: { useValue: { createFiles: createFilesMock, findManyFiles: findManyFilesMock } },
        });
        const mockApp = await getApp(mockRegisterOptions);
        mockFileRequestSender = new FileRequestSender(mockApp);

        const body = createStringifiedFakeFile();

        const response = await mockFileRequestSender.postFileBulk(sync.id as string, [body]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });
});
