import httpStatus from 'http-status-codes';
import { Application } from 'express';
import { container } from 'tsyringe';
import { registerTestValues } from '../testContainerConfig';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { StringifiedSync } from '../sync/types';
import { postSync } from '../sync/helpers/requestSender';
import { postFile } from '../file/helpers/requestSender';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { StringifiedFile } from '../file/types';
import * as requestSender from './helpers/requestSender';
import { createStringifiedFakeEntity } from './helpers/generators';

describe('entity', function () {
  let app: Application;
  let sync: StringifiedSync;
  let file: StringifiedFile;

  beforeAll(async function () {
    await registerTestValues();
    app = requestSender.getApp();
    sync = createStringifiedFakeSync();
    await postSync(app, sync);
    file = createStringifiedFakeFile();
    await postFile(app, sync.id as string, file);
  });
  afterAll(function () {
    container.clearInstances();
  });

  describe('Happy Path', function () {
    describe('POST /file/:fileId/entity', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeEntity();
        const response = await requestSender.postEntity(app, file.fileId as string, body);

        console.log(file.fileId);
        console.log(body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });
    describe('POST /file/:fileId/entity/:entityId', function () {
      it('should return 200 status code and OK body', async function () {
        const response = await requestSender.postEntityBulk(app, file.fileId as string, [
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
        ]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });
  });

  /*   describe('Bad Path', function () {
    describe('POST /file/:fileId/entity', function () {
      it('should return 400 if the fileId is not valid', async function () {
        const body = createStringifiedFakeEntity();

        const response = await requestSender.postEntity(app, faker.random.word(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.fileId should match format "uuid"');
      });

      it('should return 400 if a required property is missing', async function () {
        const { status, ...body } = createStringifiedFakeEntity();

        const response = await requestSender.postEntity(app, file.fileId as string, body as Entity);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'status'");
      });

      it('should return 404 if the file was not found', async function () {
        const uuid = faker.datatype.uuid();
        const response = await requestSender.postEntity(app, uuid, createStringifiedFakeEntity());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
        expect(response.body).toHaveProperty('message', `sync = ${uuid} not found`);
      });

      it('should return 409 if a entity already exists', async function () {
        const entity = createStringifiedFakeEntity();
        await requestSender.postEntity(app, sync.id as string, entity);

        const response = await requestSender.postEntity(app, file.fileId as string, entity);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('POST /file/:fileId/entity/:entityId', function () {
      it('should return 400 if the file id is not valid', async function () {
        const body = createStringifiedFakeEntity();

        const response = await requestSender.postEntityBulk(app, faker.random.word(), [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.fileId should match format "uuid"');
      });

      it('should return 400 if a status is not valid', async function () {
        const body = createStringifiedFakeEntity({ status: faker.random.word() as EntityStatus });

        const response = await requestSender.postEntityBulk(app, file.fileId as string, [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body[0].status should match format "date-time"');
      });

      it('should return 404 if no file with the specificed file id was found', async function () {
        const body = createStringifiedFakeEntity();

        const response = await requestSender.postEntityBulk(app, faker.datatype.uuid(), [body]);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 409 if a entity already exists', async function () {
        const entity = createStringifiedFakeEntity();

        const response = await requestSender.postEntityBulk(app, file.fileId as string, [entity, entity]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });
  }); */

  /*   describe('Sad Path', function () {
    describe('POST /file/:fileId/entity', function () {
      it('should return 500 if the db throws an error', async function () {
        const createEntityMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const mockedApp = requestSender.getMockedRepoApp({ createEntity: createEntityMock });

        const response = await requestSender.postEntity(mockedApp, file.fileId as string, createStringifiedFakeEntity());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
    describe('POST /file/:fileId/entity/:entityId', function () {
      it('should return 500 if the db throws an error', async function () {
        const createEntitiesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const mockedApp = requestSender.getMockedRepoApp({ createEntities: createEntitiesMock });
        const body = createStringifiedFakeEntity();

        const response = await requestSender.postEntityBulk(mockedApp, file.fileId as string, [body]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  }); */
});
