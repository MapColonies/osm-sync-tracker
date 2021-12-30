import httpStatus, { StatusCodes } from 'http-status-codes';
import { container } from 'tsyringe';
import faker from 'faker';
import { Connection, QueryFailedError } from 'typeorm';
import { getApp } from '../../../src/app';
import { BEFORE_ALL_TIMEOUT, getBaseRegisterOptions } from '../helpers';
import { syncRepositorySymbol } from '../../../src/sync/DAL/syncRepository';
import { GeometryType } from '../../../src/common/enums';
import { createStringifiedFakeSync } from './helpers/generators';
import { SyncRequestSender } from './helpers/requestSender';

describe('sync', function () {
  let syncRequestSender: SyncRequestSender;
  let mockSyncRequestSender: SyncRequestSender;

  beforeAll(async function () {
    const app = await getApp(getBaseRegisterOptions());
    syncRequestSender = new SyncRequestSender(app);
  }, BEFORE_ALL_TIMEOUT);

  afterAll(async function () {
    const connection = container.resolve(Connection);
    await connection.close();
    container.reset();
  });

  describe('Happy Path', function () {
    describe('POST /sync', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeSync();
        const response = await syncRequestSender.postSync(body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
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
        const response = await syncRequestSender.getLatestSync((faker.random.word() as unknown) as number, GeometryType.POLYGON);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.query.layerId should be integer');
      });

      it('should return 400 if the geometryType is not valid', async function () {
        const response = await syncRequestSender.getLatestSync(faker.datatype.number(), (faker.random.word() as unknown) as GeometryType);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.query.geometryType should be equal to one of the allowed values: point, linestring, polygon'
        );
      });

      it('should return 404 if no sync with the specified layerId was found', async function () {
        const response = await syncRequestSender.getLatestSync(faker.datatype.number(), GeometryType.POLYGON);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 404 if no sync with the specified geomertyType was found', async function () {
        const sync = createStringifiedFakeSync({ geometryType: GeometryType.POLYGON });

        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        const response = await syncRequestSender.getLatestSync(sync.layerId as number, GeometryType.LINESTRING);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
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
          token: syncRepositorySymbol,
          provider: {
            useValue: {
              createSync: createSyncMock,
              findOneSync: findOneSyncMock,
              findSyncs: findSyncsMock,
            },
          },
        });
        const mockApp = await getApp(mockRegisterOptions);
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
        const findSyncsMock = jest.fn().mockResolvedValue([]);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: syncRepositorySymbol,
          provider: {
            useValue: {
              updateSync: updateSyncMock,
              findOneSync: findOneSyncMock,
              findSyncs: findSyncsMock,
            },
          },
        });
        const mockApp = await getApp(mockRegisterOptions);
        mockSyncRequestSender = new SyncRequestSender(mockApp);
        const { id, isFull, ...body } = createStringifiedFakeSync();

        const response = await mockSyncRequestSender.patchSync(id as string, body);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
    describe('GET /sync/latest', function () {
      it('should return 500 if the db throws an error', async function () {
        const getLatestSyncMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: syncRepositorySymbol, provider: { useValue: { getLatestSync: getLatestSyncMock } } });
        const mockApp = await getApp(mockRegisterOptions);
        mockSyncRequestSender = new SyncRequestSender(mockApp);
        const body = createStringifiedFakeSync();

        const response = await mockSyncRequestSender.getLatestSync(body.layerId as number, body.geometryType as GeometryType);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });
});
