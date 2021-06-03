import httpStatus, { StatusCodes } from 'http-status-codes';
import { DependencyContainer } from 'tsyringe';
import { Application } from 'express';
import faker from 'faker';
import { Connection, QueryFailedError } from 'typeorm';
import { postSync } from '../sync/helpers/requestSender';
import { postFile } from '../file/helpers/requestSender';
import { postEntity } from '../entity/helpers/requestSender';
import { StringifiedSync } from '../sync/types';
import { StringifiedFile } from '../file/types';
import { registerTestValues } from '../testContainerConfig';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { createStringifiedFakeEntity, StringifiedEntity } from '../entity/helpers/generators';
import * as requestSender from './helpers/requestSender';
import { createStringifiedFakeChangeset } from './helpers/generators';

jest.setTimeout(30000);

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
    entity.changesetId = faker.datatype.uuid();
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
        const body = { changesetId: entity.changesetId as string, osmId: faker.datatype.number() };
        await requestSender.postChangeset(app, body);

        const response = await requestSender.putChangeset(app, entity.changesetId as string);

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

      it('should return 404 if no changeset with the specificed id was found', async function () {
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

      it('should return 404 if no changeset with the specificed id was found', async function () {
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

        const body = { changesetId: entity.changesetId as string, osmId: faker.datatype.number() };
        await requestSender.postChangeset(app, body);

        const response = await requestSender.putChangeset(mockedApp, body.changesetId);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });
  });
});
