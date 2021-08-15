import httpStatus, { StatusCodes } from 'http-status-codes';
import { DependencyContainer } from 'tsyringe';
import { Application } from 'express';
import faker from 'faker';
import { Connection, QueryFailedError } from 'typeorm';
import { postSync, getLatestSync } from '../sync/helpers/requestSender';
import { postFile } from '../file/helpers/requestSender';
import { postEntityBulk, patchEntities, patchEntity, postEntity } from '../entity/helpers/requestSender';
import { registerTestValues } from '../testContainerConfig';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { createStringifiedFakeEntity } from '../entity/helpers/generators';
import { EntityStatus, Status } from '../../../src/common/enums';
import { Sync } from '../../../src/sync/models/sync';
import { expectResponseStatusCode } from '../helpers';
import * as requestSender from './helpers/requestSender';
import { createStringifiedFakeChangeset } from './helpers/generators';

jest.setTimeout(3000000);

describe('changeset', function () {
  let app: Application;
  let connection: Connection;
  let container: DependencyContainer;

  beforeAll(async function () {
    container = await registerTestValues();
    app = requestSender.getApp(container);
    connection = container.resolve(Connection);
  }, 15000);
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

        expectResponseStatusCode(await requestSender.postChangeset(app, body), StatusCodes.CREATED);
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
        expectResponseStatusCode(await requestSender.postChangeset(app, body), StatusCodes.CREATED);

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

        expectResponseStatusCode(await requestSender.postChangeset(app, body), StatusCodes.CREATED);

        const { changesetId, ...updateBody } = body;

        const response = await requestSender.patchChangeset(mockedApp, changesetId as string, updateBody);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PUT /changeset/{changesetId}/close', function () {
      it('should return 500 if the db throws an error', async function () {
        const closeChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);
        const mockedApp = requestSender.getMockedRepoApp(container, { closeChangeset: closeChangesetMock, findOneChangeset: findOneChangesetMock });

        const body = createStringifiedFakeChangeset();
        expectResponseStatusCode(await requestSender.postChangeset(app, body), StatusCodes.CREATED);

        const response = await requestSender.putChangeset(mockedApp, body.changesetId as string);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });

  describe('Flow', function () {
    it('should create sync, files, entities, changeset and close it', async function () {
      // create a sync
      const sync = createStringifiedFakeSync({ totalFiles: 2 });
      expectResponseStatusCode(await postSync(app, sync), StatusCodes.CREATED);

      // create two files with 6 entities overall
      const file1 = createStringifiedFakeFile({ totalEntities: 2 });
      const file2 = createStringifiedFakeFile({ totalEntities: 4 });
      expectResponseStatusCode(await postFile(app, sync.id as string, file1), StatusCodes.CREATED);
      expectResponseStatusCode(await postFile(app, sync.id as string, file2), StatusCodes.CREATED);

      // create the entities, one of them won't be synced
      const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
      let file2Entities = [
        createStringifiedFakeEntity(),
        createStringifiedFakeEntity(),
        createStringifiedFakeEntity(),
        createStringifiedFakeEntity(),
      ];
      await postEntityBulk(app, file1.fileId as string, file1Entities);
      await postEntityBulk(app, file2.fileId as string, file2Entities);
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
      expectResponseStatusCode(await requestSender.postChangeset(app, changeset1), StatusCodes.CREATED);

      expect(await getLatestSync(app, sync.layerId as number)).toHaveProperty('body.status', Status.IN_PROGRESS);

      expectResponseStatusCode(await requestSender.postChangeset(app, changeset2), StatusCodes.CREATED);

      // patch all entities except the not synced one, the sync should not complete yet
      const patchBody = [...file1Entities, ...file2Entities].map((entity, index) => ({
        entityId: entity.entityId,
        fileId: entity.fileId,
        changesetId: index % 2 === 0 ? changeset1.changesetId : changeset2.changesetId,
      }));
      expectResponseStatusCode(await patchEntities(app, patchBody), StatusCodes.OK);
      expectResponseStatusCode(await requestSender.putChangeset(app, changeset1.changesetId as string), StatusCodes.OK);

      expect(await getLatestSync(app, sync.layerId as number)).toHaveProperty('body.status', Status.IN_PROGRESS);

      expectResponseStatusCode(await requestSender.putChangeset(app, changeset2.changesetId as string), StatusCodes.OK);

      expect(await getLatestSync(app, sync.layerId as number)).toHaveProperty('body.status', Status.IN_PROGRESS);

      // patch the not synced entity should complete the sync
      expectResponseStatusCode(
        await patchEntity(app, notSyncedEntity.fileId as string, notSyncedEntity.entityId as string, { status: EntityStatus.NOT_SYNCED }),
        StatusCodes.OK
      );

      const latestSyncResponse = await getLatestSync(app, sync.layerId as number);

      expect(latestSyncResponse).toHaveProperty('status', StatusCodes.OK);
      expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
      expect(latestSyncResponse).toHaveProperty('body.endDate');
      expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
    });
  });

  describe('Flow with mixed synced and not synced entities', function () {
    it('should create a sync with not synced entity that should complete the file and the sync', async function () {
      // create sync
      const sync = createStringifiedFakeSync({ totalFiles: 1 });
      expectResponseStatusCode(await postSync(app, sync), StatusCodes.CREATED);

      // create file with 2 entities
      const file = createStringifiedFakeFile({ totalEntities: 2 });
      expectResponseStatusCode(await postFile(app, sync.id as string, file), StatusCodes.CREATED);

      // create entities, one will be synced the other won't
      const fileEntities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
      expectResponseStatusCode(await postEntityBulk(app, file.fileId as string, fileEntities), StatusCodes.CREATED);

      fileEntities.forEach((entity) => {
        entity.fileId = file.fileId;
      });

      const [notSyncedEntity, syncedEntity] = fileEntities;

      // create changeset
      const changeset = createStringifiedFakeChangeset();
      expectResponseStatusCode(await requestSender.postChangeset(app, changeset), StatusCodes.CREATED);

      // patch the first entity, the sync shouldn't complete
      expectResponseStatusCode(
        await patchEntity(app, syncedEntity.fileId as string, syncedEntity.entityId as string, { changesetId: changeset.changesetId as string }),
        StatusCodes.OK
      );
      expectResponseStatusCode(await requestSender.putChangeset(app, changeset.changesetId as string), StatusCodes.OK);

      expect(await getLatestSync(app, sync.layerId as number)).toHaveProperty('body.status', Status.IN_PROGRESS);

      // patch the other entity as not synced should complete the whole sync
      expectResponseStatusCode(
        await patchEntity(app, file.fileId as string, notSyncedEntity.entityId as string, { status: EntityStatus.NOT_SYNCED }),
        StatusCodes.OK
      );

      const latestSyncResponse = await getLatestSync(app, sync.layerId as number);

      expect(latestSyncResponse).toHaveProperty('status', StatusCodes.OK);
      expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
      expect(latestSyncResponse).toHaveProperty('body.endDate');
      expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
    });

    it('should create a sync with not synced entity that should not complete the file and the sync', async function () {
      // create sync
      const sync = createStringifiedFakeSync({ totalFiles: 1 });
      expectResponseStatusCode(await postSync(app, sync), StatusCodes.CREATED);

      // create file with 2 entities
      const file = createStringifiedFakeFile({ totalEntities: 2 });
      expectResponseStatusCode(await postFile(app, sync.id as string, file), StatusCodes.CREATED);

      // create entities, one will be synced the other won't
      const fileEntities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
      expectResponseStatusCode(await postEntityBulk(app, file.fileId as string, fileEntities), StatusCodes.CREATED);

      fileEntities.forEach((entity) => {
        entity.fileId = file.fileId;
      });

      const [notSyncedEntity, syncedEntity] = fileEntities;

      // create changeset
      const changeset = createStringifiedFakeChangeset();
      expectResponseStatusCode(await requestSender.postChangeset(app, changeset), StatusCodes.CREATED);

      // patch the first not synced entity, the sync shouldn't complete
      expectResponseStatusCode(
        await patchEntity(app, file.fileId as string, notSyncedEntity.entityId as string, { status: EntityStatus.NOT_SYNCED }),
        StatusCodes.OK
      );
      expectResponseStatusCode(await requestSender.putChangeset(app, changeset.changesetId as string), StatusCodes.OK);

      expect(await getLatestSync(app, sync.layerId as number)).toHaveProperty('body.status', Status.IN_PROGRESS);

      // patch the other entity as synced. this should complete the whole sync
      expectResponseStatusCode(
        await patchEntity(app, syncedEntity.fileId as string, syncedEntity.entityId as string, { changesetId: changeset.changesetId as string }),
        StatusCodes.OK
      );
      expectResponseStatusCode(await requestSender.putChangeset(app, changeset.changesetId as string), StatusCodes.OK);

      const latestSyncResponse = await getLatestSync(app, sync.layerId as number);

      expect(latestSyncResponse).toHaveProperty('status', StatusCodes.OK);
      expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
      expect(latestSyncResponse).toHaveProperty('body.endDate');
      expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
    });

    it('should create a sync with not synced entity that should only complete the file but not the whole sync', async function () {
      // create sync
      const sync = createStringifiedFakeSync({ totalFiles: 2 });

      expectResponseStatusCode(await postSync(app, sync), StatusCodes.CREATED);

      // create 2 files
      const file1 = createStringifiedFakeFile({ totalEntities: 2 });
      const file2 = createStringifiedFakeFile({ totalEntities: 1 });

      expectResponseStatusCode(await postFile(app, sync.id as string, file1), StatusCodes.CREATED);
      expectResponseStatusCode(await postFile(app, sync.id as string, file2), StatusCodes.CREATED);

      // create 3 entities, file 1 entities will be synced and not synced, file2 entity will be synced last
      const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
      const file2Entity = createStringifiedFakeEntity();

      expectResponseStatusCode(await postEntityBulk(app, file1.fileId as string, file1Entities), StatusCodes.CREATED);
      expectResponseStatusCode(await postEntity(app, file2.fileId as string, file2Entity), StatusCodes.CREATED);

      file1Entities.forEach((entity) => {
        entity.fileId = file1.fileId;
      });

      const [notSyncedEntity, syncedEntity] = file1Entities;

      // create changeset
      const changeset = createStringifiedFakeChangeset();

      expectResponseStatusCode(await requestSender.postChangeset(app, changeset), StatusCodes.CREATED);

      // patch first synced entity of file1
      expectResponseStatusCode(
        await patchEntity(app, syncedEntity.fileId as string, syncedEntity.entityId as string, { changesetId: changeset.changesetId as string }),
        StatusCodes.OK
      );
      expectResponseStatusCode(await requestSender.putChangeset(app, changeset.changesetId as string), StatusCodes.OK);

      expect(await getLatestSync(app, sync.layerId as number)).toHaveProperty('body.status', Status.IN_PROGRESS);

      // patch second not synced entity of file1. will close the file but not the sync
      expectResponseStatusCode(
        await patchEntity(app, notSyncedEntity.fileId as string, notSyncedEntity.entityId as string, { status: EntityStatus.NOT_SYNCED }),
        StatusCodes.OK
      );
      expectResponseStatusCode(await requestSender.putChangeset(app, changeset.changesetId as string), StatusCodes.OK);

      expect(await getLatestSync(app, sync.layerId as number)).toHaveProperty('body.status', Status.IN_PROGRESS);

      // patch the last entity, should close the sync
      expectResponseStatusCode(
        await patchEntity(app, file2.fileId as string, file2Entity.entityId as string, { changesetId: changeset.changesetId as string }),
        StatusCodes.OK
      );
      expectResponseStatusCode(await requestSender.putChangeset(app, changeset.changesetId as string), StatusCodes.OK);

      const latestSyncResponse = await getLatestSync(app, sync.layerId as number);

      expect(latestSyncResponse).toHaveProperty('status', StatusCodes.OK);
      expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
      expect(latestSyncResponse).toHaveProperty('body.endDate');
      expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
    });
  });
});
