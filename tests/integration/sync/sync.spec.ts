/* eslint-disable @typescript-eslint/no-unused-vars */
import httpStatus, { StatusCodes } from 'http-status-codes';
import { DependencyContainer } from 'tsyringe';
import { Application } from 'express';
import faker from 'faker';
import { Connection, QueryFailedError } from 'typeorm';
import { registerTestValues } from '../testContainerConfig';
import * as requestSender from './helpers/requestSender';
import { createStringifiedFakeSync } from './helpers/generators';

jest.setTimeout(30000);

describe('sync', function () {
  let app: Application;
  let connection: Connection;
  let container: DependencyContainer;

  beforeAll(async function () {
    container = await registerTestValues();
    app = requestSender.getApp(container);
    connection = container.resolve(Connection);
  });
  afterAll(async function () {
    await connection.close();
    container.reset();
  });

  describe('Happy Path', function () {
    describe('POST /sync', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeSync();
        const response = await requestSender.postSync(app, body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });

    describe('PATCH /sync', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeSync();
        await requestSender.postSync(app, body);
        const { id, ...updateBody } = body;
        const response = await requestSender.patchSync(app, id as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('GET /sync/latest', function () {
      it('should return 200 status code and the latest sync entity', async function () {
        const earlierDate = faker.date.past().toISOString();
        const earlier = createStringifiedFakeSync({ dumpDate: earlierDate });
        const { layerId } = earlier;

        const later = createStringifiedFakeSync({ dumpDate: faker.date.between(earlierDate, Date()).toISOString(), layerId });
        await requestSender.postSync(app, earlier);
        await requestSender.postSync(app, later);

        const response = await requestSender.getLatestSync(app, layerId as number);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject(later);
      });
    });
  });

  describe('Bad Path', function () {
    describe('POST /sync', function () {
      it('should return 400 if the id is not valid', async function () {
        const body = createStringifiedFakeSync({ id: faker.random.word() });

        const response = await requestSender.postSync(app, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.id should match format "uuid"');
      });

      it('should return 400 if a required property is missing', async function () {
        const { dumpDate, ...body } = createStringifiedFakeSync();

        const response = await requestSender.postSync(app, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'dumpDate'");
      });

      it('should return 409 if a sync already exists', async function () {
        const body = createStringifiedFakeSync();
        await requestSender.postSync(app, body);

        const response = await requestSender.postSync(app, body);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('PATCH /sync', function () {
      it('should return 400 if the id is not valid', async function () {
        const body = createStringifiedFakeSync({ id: faker.random.word() });

        const response = await requestSender.patchSync(app, faker.random.word(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.syncId should match format "uuid"');
      });

      it('should return 400 if a date is not valid', async function () {
        const { id, ...body } = createStringifiedFakeSync({ dumpDate: faker.random.word() });

        const response = await requestSender.patchSync(app, id as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.dumpDate should match format "date-time"');
      });

      it('should return 404 if no sync with the specificed id was found', async function () {
        const { id, ...body } = createStringifiedFakeSync();

        const response = await requestSender.patchSync(app, faker.datatype.uuid(), body);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('GET /sync/latest', function () {
      it('should return 400 if the layerId is not valid', async function () {
        const response = await requestSender.getLatestSync(app, (faker.random.word() as unknown) as number);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.query.layerId should be integer');
      });

      it('should return 404 if no sync with the specificed layerId was found', async function () {
        const response = await requestSender.getLatestSync(app, faker.datatype.number());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });
  });

  describe('Sad Path', function () {
    describe('POST /sync', function () {
      it('should return 500 if the db throws an error', async function () {
        const createSyncMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneSyncMock = jest.fn();
        const mockedApp = requestSender.getMockedRepoApp(container, { createSync: createSyncMock, findOneSync: findOneSyncMock });

        const response = await requestSender.postSync(mockedApp, createStringifiedFakeSync());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /sync', function () {
      it('should return 500 if the db throws an error', async function () {
        const createSyncMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneSyncMock = jest.fn().mockResolvedValue(true);
        const mockedApp = requestSender.getMockedRepoApp(container, { updateSync: createSyncMock, findOneSync: findOneSyncMock });
        const body = createStringifiedFakeSync();

        const response = await requestSender.patchSync(mockedApp, body.id as string, body);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
    describe('GET /sync/latest', function () {
      it('should return 500 if the db throws an error', async function () {
        const createSyncMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const mockedApp = requestSender.getMockedRepoApp(container, { getLatestSync: createSyncMock });
        const body = createStringifiedFakeSync();

        const response = await requestSender.getLatestSync(mockedApp, body.layerId as number);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });
});
