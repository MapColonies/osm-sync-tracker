import httpStatus, { StatusCodes } from 'http-status-codes';
import { Application } from 'express';
import { DependencyContainer } from 'tsyringe';
import { Connection, QueryFailedError } from 'typeorm';
import faker from 'faker';
import { registerTestValues } from '../testContainerConfig';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { StringifiedSync } from '../sync/types';
import { postSync } from '../sync/helpers/requestSender';
import { postFile } from '../file/helpers/requestSender';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { StringifiedFile } from '../file/types';
import { ActionType, EntityStatus } from '../../../src/common/enums';
import { Entity } from '../../../src/entity/models/entity';
import * as requestSender from './helpers/requestSender';
import { createStringifiedFakeEntity } from './helpers/generators';

describe('entity', function () {
  let app: Application;
  let sync: StringifiedSync;
  let file: StringifiedFile;
  let connection: Connection;
  let container: DependencyContainer;

  beforeAll(async function () {
    container = await registerTestValues();
    app = requestSender.getApp(container);
    sync = createStringifiedFakeSync();
    await postSync(app, sync);
    file = createStringifiedFakeFile();
    await postFile(app, sync.id as string, file);
    connection = container.resolve(Connection);
  });

  afterAll(async function () {
    await connection.close();
    container.reset();
  });

  describe('Happy Path', function () {
    describe('POST /file/:fileId/entity', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeEntity();
        const response = await requestSender.postEntity(app, file.fileId as string, body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });
    describe('POST /file/:fileId/entity/_bulk', function () {
      it('should return 201 status code and OK body', async function () {
        const response = await requestSender.postEntityBulk(app, file.fileId as string, [
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
        ]);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });
    describe('PATCH /file/:fileId/entity/:entityId', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeEntity();
        await requestSender.postEntity(app, file.fileId as string, body);
        const { entityId, ...updateBody } = body;

        updateBody.action = ActionType.MODIFY;

        const response = await requestSender.patchEntity(app, file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('PATCH /entity/_bulk', function () {
      it('should return 200 status code and OK body', async function () {
        const body = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        await requestSender.postEntityBulk(app, file.fileId as string, body);

        body[0].action = ActionType.MODIFY;
        body[1].failReason = 'epic failure';

        const response = await requestSender.patchEntities(app, body);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });
  });

  describe('Bad Path', function () {
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
        expect(response.body).toHaveProperty('message', `file = ${uuid} not found`);
      });

      it('should return 409 if a entity already exists', async function () {
        const entity = createStringifiedFakeEntity();
        await requestSender.postEntity(app, file.fileId as string, entity);

        const response = await requestSender.postEntity(app, file.fileId as string, entity);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('POST /file/:fileId/entity/_bulk', function () {
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
        expect(response.body).toHaveProperty(
          'message',
          'request.body[0].status should be equal to one of the allowed values: inprogress, not_synced, completed, failed'
        );
      });

      it('should return 404 if no file with the specified file id was found', async function () {
        const body = createStringifiedFakeEntity();

        const response = await requestSender.postEntityBulk(app, faker.datatype.uuid(), [body]);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 409 if one of the entity is duplicate', async function () {
        const entity = createStringifiedFakeEntity();

        const response = await requestSender.postEntityBulk(app, file.fileId as string, [entity, entity]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });

      it('should return 409 if one of the entity already exsits in the db', async function () {
        const entity = createStringifiedFakeEntity();
        const entity2 = createStringifiedFakeEntity();

        await requestSender.postEntity(app, file.fileId as string, entity);

        const response = await requestSender.postEntityBulk(app, file.fileId as string, [entity, entity2]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('PATCH /file/:fileId/entity/:entityId', function () {
      it('should return 400 if the enittyId is not valid', async function () {
        const { entityId, ...updateBody } = createStringifiedFakeEntity();

        const response = await requestSender.patchEntity(app, file.fileId as string, faker.random.word(), updateBody);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.params.entityId should match pattern "{[0-9a-fA-F]{8}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{12}}"'
        );
      });

      it('should return 400 if a status is not valid', async function () {
        const { entityId, ...updateBody } = createStringifiedFakeEntity({ status: faker.random.word() as EntityStatus });

        const response = await requestSender.patchEntity(app, file.fileId as string, entityId as string, updateBody);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.body.status should be equal to one of the allowed values: inprogress, not_synced, completed, failed'
        );
      });

      it('should return 404 if no entity with the specified id was found', async function () {
        const { entityId, ...updateBody } = createStringifiedFakeEntity();

        const response = await requestSender.patchEntity(app, file.fileId as string, entityId as string, updateBody);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('PATCH /entity/_bulk', function () {
      it('should return 400 if the sync id is not valid', async function () {
        const body = createStringifiedFakeEntity({ entityId: faker.random.word() });

        const response = await requestSender.patchEntities(app, [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
      });

      it('should return 400 if a status is not valid', async function () {
        const body = createStringifiedFakeEntity({ status: faker.random.word() as EntityStatus });

        const response = await requestSender.patchEntities(app, [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.body[0].status should be equal to one of the allowed values: inprogress, not_synced, completed, failed'
        );
      });

      it('should return 404 if no entity with the specified entity id was found', async function () {
        const entity = createStringifiedFakeEntity();

        const response = await requestSender.patchEntities(app, [entity]);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 404 if one of the entity does not exist in the db', async function () {
        const entity = createStringifiedFakeEntity();

        await requestSender.postEntity(app, file.fileId as string, entity);

        const entities = [{ ...entity, status: EntityStatus.FAILED, failReason: faker.random.word() }, createStringifiedFakeEntity()];

        const response = await requestSender.patchEntities(app, entities);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
      it('should return 409 if one of the updateEntitites entities is a duplicate', async function () {
        const entity = createStringifiedFakeEntity();

        const response = await requestSender.patchEntities(app, [entity, entity]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });
  });

  describe('Sad Path', function () {
    describe('POST /file/:fileId/entity', function () {
      it('should return 500 if the db throws an error', async function () {
        const createEntityMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneEntityMock = jest.fn().mockResolvedValue(false);
        const findManyEntitesMock = jest.fn().mockResolvedValue(false);

        const mockedApp = requestSender.getMockedRepoApp(container, {
          createEntity: createEntityMock,
          findOneEntity: findOneEntityMock,
          findManyEntites: findManyEntitesMock,
        });

        const response = await requestSender.postEntity(mockedApp, file.fileId as string, createStringifiedFakeEntity());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
    describe('POST /file/:fileId/entity/:entityId', function () {
      it('should return 500 if the db throws an error', async function () {
        const createEntitiesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneEntityMock = jest.fn().mockResolvedValue(false);
        const findManyEntitesMock = jest.fn().mockResolvedValue(false);

        const mockedApp = requestSender.getMockedRepoApp(container, {
          createEntities: createEntitiesMock,
          findOneEntity: findOneEntityMock,
          findManyEntites: findManyEntitesMock,
        });
        const body = createStringifiedFakeEntity();

        const response = await requestSender.postEntityBulk(mockedApp, file.fileId as string, [body]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /file/:fileId/entity/:entityId', function () {
      it('should return 500 if the db throws an error', async function () {
        const createEntitiesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneEntityMock = jest.fn().mockResolvedValue(true);
        const mockedApp = requestSender.getMockedRepoApp(container, { updateEntity: createEntitiesMock, findOneEntity: findOneEntityMock });
        const { entityId, ...updateBody } = createStringifiedFakeEntity();

        const response = await requestSender.patchEntity(mockedApp, file.fileId as string, entityId as string, updateBody);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /entity/_bulk', function () {
      it('should return 500 if the db throws an error', async function () {
        const updateEntitiesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const countEntitiesByIdsMock = jest.fn().mockResolvedValue(1);
        const mockedApp = requestSender.getMockedRepoApp(container, {
          updateEntities: updateEntitiesMock,
          countEntitiesByIds: countEntitiesByIdsMock,
        });
        const { fileId, ...entity } = createStringifiedFakeEntity();

        const response = await requestSender.patchEntities(mockedApp, [entity]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });
});
