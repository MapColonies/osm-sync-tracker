import httpStatus, { StatusCodes } from 'http-status-codes';
import { DependencyContainer } from 'tsyringe';
import { Application } from 'express';
import faker from 'faker';
import { Connection, QueryFailedError } from 'typeorm';
import { postSync, getLatestSync } from '../sync/helpers/requestSender';
import { postFile } from '../file/helpers/requestSender';
import { postEntity, postEntityBulk, patchEntities } from '../entity/helpers/requestSender';
import { StringifiedSync } from '../sync/types';
import { StringifiedFile } from '../file/types';
import { registerTestValues } from '../testContainerConfig';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { createStringifiedFakeEntity, StringifiedEntity } from '../entity/helpers/generators';
import { Status } from '../../../src/common/enums';
import { Sync } from '../../../src/sync/models/sync';
import * as requestSender from './helpers/requestSender';
import { createStringifiedFakeChangeset } from './helpers/generators';

describe('changeset', function () {
  let app: Application;
  let sync: StringifiedSync;
  let file: StringifiedFile;
  let entity: StringifiedEntity;
  let connection: Connection;
  let container: DependencyContainer;

  beforeAll(async function () {
    container = await registerTestValues();
    app = requestSender.getApp(container);
    sync = createStringifiedFakeSync();
    await postSync(app, sync);
    file = createStringifiedFakeFile();
    await postFile(app, sync.id as string, file);
    entity = createStringifiedFakeEntity();
    await postEntity(app, file.fileId as string, entity);
    connection = container.resolve(Connection);
  });
  afterAll(async function () {
    await connection.close();
    container.reset();
  });

  describe('Happy Path', function () {
    describe('POST /changeset', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeChangeset();
        const response = await requestSender.postChangeset(app, body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });

    describe('PATCH /changeset/{changesetId}', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeChangeset();

        await requestSender.postChangeset(app, body);
        const { changesetId, ...updateBody } = body;

        updateBody.osmId = faker.datatype.number();

        const response = await requestSender.patchChangeset(app, changesetId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('PUT /changeset/{changesetId}/close', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeChangeset();
        await requestSender.postChangeset(app, body);

        const response = await requestSender.putChangeset(app, body.changesetId as string);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });
  });

  describe('Bad Path', function () {
    describe('POST /changeset', function () {
      it('should return 400 if the changesetid is not valid', async function () {
        const body = createStringifiedFakeChangeset({ changesetId: faker.random.word() });
        const response = await requestSender.postChangeset(app, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.changesetId should match format "uuid"');
      });

      it('should return 400 if a required property is missing', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await requestSender.postChangeset(app, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'changesetId'");
      });

      it('should return 409 if a chnageset already exists', async function () {
        const body = createStringifiedFakeChangeset();
        await requestSender.postChangeset(app, body);

        const response = await requestSender.postChangeset(app, body);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('PATCH /changeset/{changesetId}', function () {
      it('should return 400 if the id is not valid', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await requestSender.patchChangeset(app, faker.random.word(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.changesetId should match format "uuid"');
      });

      it('should return 400 if a osmId is not valid', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset({ osmId: faker.random.word() });

        const response = await requestSender.patchChangeset(app, changesetId as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.osmId should be integer');
      });

      it('should return 404 if no changeset with the specified id was found', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await requestSender.patchChangeset(app, faker.datatype.uuid(), body);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('PUT /changeset/{changesetId}/close', function () {
      it('should return 400 if the id is not valid', async function () {
        const body = { changesetId: entity.changesetId as string, osmId: faker.datatype.number() };
        await requestSender.postChangeset(app, body);

        const response = await requestSender.putChangeset(app, faker.random.word());

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.changesetId should match format "uuid"');
      });

      it('should return 404 if no changeset with the specified id was found', async function () {
        const response = await requestSender.putChangeset(app, faker.datatype.uuid());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });
  });

  describe('Sad Path', function () {
    describe('POST /changeset', function () {
      it('should return 500 if the db throws an error', async function () {
        const createChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMock = jest.fn().mockResolvedValue(false);

        const mockedApp = requestSender.getMockedRepoApp(container, { createChangeset: createChangesetMock, findOneChangeset: findOneChangesetMock });

        const response = await requestSender.postChangeset(mockedApp, createStringifiedFakeChangeset());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /changeset/{changeset}', function () {
      it('should return 500 if the db throws an error', async function () {
        const updateChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);
        const mockedApp = requestSender.getMockedRepoApp(container, { updateChangeset: updateChangesetMock, findOneChangeset: findOneChangesetMock });
        const body = createStringifiedFakeChangeset();

        await requestSender.postChangeset(app, body);

        const { changesetId, ...updateBody } = body;

        const response = await requestSender.patchChangeset(mockedApp, changesetId as string, updateBody);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PUT /changeset/{changesetId}/close', function () {
      it('should return 500 if the db throws an error', async function () {
        const closeChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMokc = jest.fn().mockResolvedValue(true);
        const mockedApp = requestSender.getMockedRepoApp(container, { closeChangeset: closeChangesetMock, findOneChangeset: findOneChangesetMokc });

        const body = createStringifiedFakeChangeset();
        await requestSender.postChangeset(app, body);

        const response = await requestSender.putChangeset(mockedApp, body.changesetId as string);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });

  describe('Flow', function () {
    it('should create sync, files, entities, changeset and close it', async function () {
      const sync = createStringifiedFakeSync({ totalFiles: 2 });

      await postSync(app, sync);

      const file1 = createStringifiedFakeFile({ totalEntities: 2 });
      const file2 = createStringifiedFakeFile({ totalEntities: 3 });

      await postFile(app, sync.id as string, file1);
      await postFile(app, sync.id as string, file2);

      const file1Entities = [createStringifiedFakeEntity({ fileId: file1.fileId }), createStringifiedFakeEntity({ fileId: file1.fileId })];

      const file2Entities = [
        createStringifiedFakeEntity({ fileId: file2.fileId }),
        createStringifiedFakeEntity({ fileId: file2.fileId }),
        createStringifiedFakeEntity({ fileId: file2.fileId }),
      ];

      await postEntityBulk(app, file1.fileId as string, file1Entities);
      await postEntityBulk(app, file2.fileId as string, file2Entities);

      const changeset1 = createStringifiedFakeChangeset();
      const changeset2 = createStringifiedFakeChangeset();

      await requestSender.postChangeset(app, changeset1);
      await requestSender.postChangeset(app, changeset2);

      const patchBody = [...file1Entities, ...file2Entities].map((entity, index) => ({
        entityId: entity.entityId,
        changesetId: index % 2 === 0 ? changeset1.changesetId : changeset2.changesetId,
      }));

      await patchEntities(app, patchBody);

      await requestSender.putChangeset(app, changeset1.changesetId as string);
      await requestSender.putChangeset(app, changeset2.changesetId as string);

      const latestSyncResponse = await getLatestSync(app, sync.layerId as number);

      expect(latestSyncResponse).toHaveProperty('status', StatusCodes.OK);
      expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
      expect(latestSyncResponse).toHaveProperty('body.endDate');
      expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
    });
  });
});
