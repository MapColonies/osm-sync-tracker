import httpStatus, { StatusCodes } from 'http-status-codes';
import { container } from 'tsyringe';
import { Application } from 'express';
import faker from 'faker';
import { QueryFailedError } from 'typeorm';
import { registerTestValues } from '../testContainerConfig';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { StringifiedSync } from '../sync/types';
import { postSync } from '../sync/helpers/requestSender';
import * as requestSender from './helpers/requestSender';
import { createStringifiedFakeFile } from './helpers/generators';

describe('file', function () {
  let app: Application;
  let sync: StringifiedSync;
  beforeAll(async function () {
    await registerTestValues();
    app = requestSender.getApp();
    sync = createStringifiedFakeSync();
    await postSync(app, sync);
  });
  afterAll(function () {
    container.clearInstances();
  });

  describe('Happy Path', function () {
    describe('POST /sync/:syncId/file', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeFile();
        const response = await requestSender.postFile(app, sync.id as string, body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });
    describe('POST /sync/:syncId/file/_bulk', function () {
      it('should return 200 status code and OK body', async function () {
        const response = await requestSender.postFileBulk(app, sync.id as string, [createStringifiedFakeFile(), createStringifiedFakeFile()]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });
  });

  describe('Bad Path', function () {
    describe('POST /sync/:syncId/file', function () {
      it('should return 400 if the syncId is not valid', async function () {
        const body = createStringifiedFakeFile();

        const response = await requestSender.postFile(app, faker.random.word(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.syncId should match format "uuid"');
      });

      it('should return 400 if a required property is missing', async function () {
        const { startDate, ...body } = createStringifiedFakeFile();

        const response = await requestSender.postFile(app, sync.id as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'startDate'");
      });

      it('should return 404 if the sync was not found', async function () {
        const uuid = faker.datatype.uuid();
        const response = await requestSender.postFile(app, uuid, createStringifiedFakeFile());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
        expect(response.body).toHaveProperty('message', `sync = ${uuid} not found`);
      });

      it('should return 409 if a file already exists', async function () {
        const file = createStringifiedFakeFile();
        await requestSender.postFile(app, sync.id as string, file);

        const response = await requestSender.postFile(app, sync.id as string, file);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('POST /sync/:syncId/file/_bulk', function () {
      it('should return 400 if the sync id is not valid', async function () {
        const body = createStringifiedFakeFile();

        const response = await requestSender.postFileBulk(app, faker.random.word(), [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.syncId should match format "uuid"');
      });

      it('should return 400 if a date is not valid', async function () {
        const body = createStringifiedFakeFile({ startDate: faker.random.word() });

        const response = await requestSender.postFileBulk(app, sync.id as string, [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body[0].startDate should match format "date-time"');
      });

      it('should return 404 if no sync with the specificed sync id was found', async function () {
        const body = createStringifiedFakeFile();

        const response = await requestSender.postFileBulk(app, faker.datatype.uuid(), [body]);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 409 if a file already exists', async function () {
        const file = createStringifiedFakeFile();

        const response = await requestSender.postFileBulk(app, sync.id as string, [file, file]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });
  });

  describe('Sad Path', function () {
    describe('POST /sync/:syncId/file', function () {
      it('should return 500 if the db throws an error', async function () {
        const createFileMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneFileMock = jest.fn().mockResolvedValue(false);

        const mockedApp = requestSender.getMockedRepoApp({ createFile: createFileMock, findOneFile: findOneFileMock });

        const response = await requestSender.postFile(mockedApp, sync.id as string, createStringifiedFakeFile());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
    describe('POST /sync/:syncId/file/_bulk', function () {
      it('should return 500 if the db throws an error', async function () {
        const createFilesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findManyFilesMock = jest.fn().mockResolvedValue(false);

        const mockedApp = requestSender.getMockedRepoApp({ createFiles: createFilesMock, findManyFiles: findManyFilesMock });
        const body = createStringifiedFakeFile();

        const response = await requestSender.postFileBulk(mockedApp, sync.id as string, [body]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });
});
