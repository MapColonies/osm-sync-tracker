import faker from 'faker';
import { container } from 'tsyringe';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { Connection, QueryFailedError } from 'typeorm';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { StringifiedSync } from '../sync/types';
import { SyncRequestSender } from '../sync/helpers/requestSender';
import { FileRequestSender } from '../file/helpers/requestSender';
import { EntityRequestSender } from '../entity/helpers/requestSender';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { StringifiedFile } from '../file/types';
import { ActionType, EntityStatus } from '../../../src/common/enums';
import { getApp } from '../../../src/app';
import { Entity } from '../../../src/entity/models/entity';
import { BEFORE_ALL_TIMEOUT, getBaseRegisterOptions } from '../helpers';
import { entityRepositorySymbol } from '../../../src/entity/DAL/entityRepository';
import { TransactionFailureError } from '../../../src/changeset/models/errors';
import { createFakeEntity, createFakeFile } from '../../helpers/helper';
import { fileRepositorySymbol } from '../../../src/file/DAL/fileRepository';
import { IApplication } from '../../../src/common/interfaces';
import { Services } from '../../../src/common/constants';
import { createStringifiedFakeEntity } from './helpers/generators';

describe('entity', function () {
  let entityRequestSender: EntityRequestSender;
  let fileRequestSender: FileRequestSender;
  let syncRequestSender: SyncRequestSender;
  let mockEntityRequestSender: EntityRequestSender;

  let sync: StringifiedSync;
  let file: StringifiedFile;

  beforeAll(async function () {
    const app = await getApp(getBaseRegisterOptions());
    entityRequestSender = new EntityRequestSender(app);
    fileRequestSender = new FileRequestSender(app);
    syncRequestSender = new SyncRequestSender(app);
    sync = createStringifiedFakeSync();
    await syncRequestSender.postSync(sync);
    file = createStringifiedFakeFile();
    await fileRequestSender.postFile(sync.id as string, file);
  }, BEFORE_ALL_TIMEOUT);

  afterAll(async function () {
    const connection = container.resolve(Connection);
    await connection.close();
    container.reset();
  });

  describe('Happy Path', function () {
    describe('POST /file/:fileId/entity', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeEntity();
        const response = await entityRequestSender.postEntity(file.fileId as string, body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });
    describe('POST /file/:fileId/entity/_bulk', function () {
      it('should return 201 status code and OK body', async function () {
        const response = await entityRequestSender.postEntityBulk(file.fileId as string, [
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
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;

        updateBody.action = ActionType.MODIFY;

        const response = await entityRequestSender.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });

      it('should return 200 status code and OK body when retries is configured', async function () {
        const numOfRetries = faker.datatype.number({ min: 1, max: 10 });
        const appConfigWithRetries: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: numOfRetries } };
        const registerOptions = getBaseRegisterOptions();
        registerOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfigWithRetries } });
        const appWithRetries = await getApp(registerOptions);
        const entityRequestSenderWithRetries = new EntityRequestSender(appWithRetries);

        const body = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;

        updateBody.action = ActionType.MODIFY;
        updateBody.status = EntityStatus.NOT_SYNCED;

        const response = await entityRequestSenderWithRetries.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });

      it('should return 200 status code when failing close file transaction once while retries is configured', async function () {
        const fakeEntity = createFakeEntity();
        const fakeFile = createFakeFile();
        const findOneEntityMock = jest.fn().mockResolvedValue(fakeEntity);
        const updateEntityMock = jest.fn();
        const findOneFileMock = jest.fn().mockResolvedValue(fakeFile);
        const tryClosingFileMock = jest.fn().mockRejectedValueOnce(new TransactionFailureError('transaction failure'));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: entityRepositorySymbol,
          provider: { useValue: { findOneEntity: findOneEntityMock, updateEntity: updateEntityMock } },
        });
        mockRegisterOptions.override.push({
          token: fileRepositorySymbol,
          provider: { useValue: { findOneFile: findOneFileMock, tryClosingFile: tryClosingFileMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: 1 } };
        mockRegisterOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfig } });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;
        updateBody.action = ActionType.MODIFY;
        updateBody.status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
        expect(tryClosingFileMock).toHaveBeenCalledTimes(2);
      });
    });

    describe('PATCH /entity/_bulk', function () {
      it('should return 200 status code and OK body', async function () {
        const body = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        expect(await entityRequestSender.postEntityBulk(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);

        body[0].action = ActionType.MODIFY;
        body[0].failReason = 'epic failure';
        body[0].fileId = file.fileId;

        body[1].failReason = 'epic failure';
        body[1].fileId = file.fileId;

        const response = await entityRequestSender.patchEntities(body);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });

      it('should return 200 status code and OK body when closing transaction fails once while retries is configured', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValueOnce(new TransactionFailureError('transaction failure'));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: fileRepositorySymbol, provider: { useValue: { tryClosingFile: tryClosingFileMock } } });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: 1 } };
        mockRegisterOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfig } });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        expect(await entityRequestSender.postEntityBulk(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);

        body[0].action = ActionType.MODIFY;
        body[0].failReason = 'epic failure';
        body[0].fileId = file.fileId;
        body[0].status = EntityStatus.NOT_SYNCED;

        body[1].failReason = 'epic failure';
        body[1].fileId = file.fileId;
        body[1].status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntities(body);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
        expect(tryClosingFileMock).toHaveBeenCalledTimes(body.length + 1);
      });
    });
  });

  describe('Bad Path', function () {
    describe('POST /file/:fileId/entity', function () {
      it('should return 400 if the fileId is not valid', async function () {
        const body = createStringifiedFakeEntity();

        const response = await entityRequestSender.postEntity(faker.random.word(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.fileId should match format "uuid"');
      });

      it('should return 400 if a required property is missing', async function () {
        const { status, ...body } = createStringifiedFakeEntity();

        const response = await entityRequestSender.postEntity(file.fileId as string, body as Entity);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'status'");
      });

      it('should return 404 if the file was not found', async function () {
        const uuid = faker.datatype.uuid();
        const response = await entityRequestSender.postEntity(uuid, createStringifiedFakeEntity());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
        expect(response.body).toHaveProperty('message', `file = ${uuid} not found`);
      });

      it('should return 409 if a entity already exists', async function () {
        const entity = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, entity)).toHaveStatus(StatusCodes.CREATED);

        const response = await entityRequestSender.postEntity(file.fileId as string, entity);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('POST /file/:fileId/entity/_bulk', function () {
      it('should return 400 if the file id is not valid', async function () {
        const body = createStringifiedFakeEntity();

        const response = await entityRequestSender.postEntityBulk(faker.random.word(), [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.fileId should match format "uuid"');
      });

      it('should return 400 if a status is not valid', async function () {
        const body = createStringifiedFakeEntity({ status: faker.random.word() as EntityStatus });

        const response = await entityRequestSender.postEntityBulk(file.fileId as string, [body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.body[0].status should be equal to one of the allowed values: inprogress, not_synced, completed, failed'
        );
      });

      it('should return 404 if no file with the specified file id was found', async function () {
        const body = createStringifiedFakeEntity();

        const response = await entityRequestSender.postEntityBulk(faker.datatype.uuid(), [body]);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 409 if one of the entity is duplicate', async function () {
        const entity = createStringifiedFakeEntity();

        const response = await entityRequestSender.postEntityBulk(file.fileId as string, [entity, entity]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });

      it('should return 409 if one of the entity already exsits in the db', async function () {
        const entity = createStringifiedFakeEntity();
        const entity2 = createStringifiedFakeEntity();

        expect(await entityRequestSender.postEntity(file.fileId as string, entity)).toHaveStatus(StatusCodes.CREATED);

        const response = await entityRequestSender.postEntityBulk(file.fileId as string, [entity, entity2]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('PATCH /file/:fileId/entity/:entityId', function () {
      it('should return 400 if the enittyId is not valid', async function () {
        const { entityId, ...updateBody } = createStringifiedFakeEntity();

        const response = await entityRequestSender.patchEntity(file.fileId as string, faker.random.word(), updateBody);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.params.entityId should match pattern "{[0-9a-fA-F]{8}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{12}}"'
        );
      });

      it('should return 400 if a status is not valid', async function () {
        const { entityId, ...updateBody } = createStringifiedFakeEntity({ status: faker.random.word() as EntityStatus });

        const response = await entityRequestSender.patchEntity(file.fileId as string, entityId as string, updateBody);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.body.status should be equal to one of the allowed values: inprogress, not_synced, completed, failed'
        );
      });

      it('should return 404 if no entity with the specified id was found', async function () {
        const { entityId, ...updateBody } = createStringifiedFakeEntity();

        const response = await entityRequestSender.patchEntity(file.fileId as string, entityId as string, updateBody);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('PATCH /entity/_bulk', function () {
      it('should return 400 if the sync id is not valid', async function () {
        const body = createStringifiedFakeEntity({ entityId: faker.random.word(), fileId: file.fileId });

        const response = await entityRequestSender.patchEntities([body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
      });

      it('should return 400 if a status is not valid', async function () {
        const body = createStringifiedFakeEntity({ status: faker.random.word() as EntityStatus, fileId: file.fileId });

        const response = await entityRequestSender.patchEntities([body]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty(
          'message',
          'request.body[0].status should be equal to one of the allowed values: inprogress, not_synced, completed, failed'
        );
      });

      it('should return 404 if no entity with the specified entity id was found', async function () {
        const entity = createStringifiedFakeEntity({ fileId: file.fileId });

        const response = await entityRequestSender.patchEntities([entity]);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 404 if no entity with the specified file id was found', async function () {
        const entity = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, entity)).toHaveStatus(StatusCodes.CREATED);

        const entities = [{ ...entity, status: EntityStatus.FAILED, failReason: faker.random.word(), fileId: faker.datatype.uuid() }];

        const response = await entityRequestSender.patchEntities(entities);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 404 if one of the entity does not exist in the db', async function () {
        const entity = createStringifiedFakeEntity();

        expect(await entityRequestSender.postEntity(file.fileId as string, entity)).toHaveStatus(StatusCodes.CREATED);

        const entities = [
          { ...entity, status: EntityStatus.FAILED, failReason: faker.random.word(), fileId: file.fileId },
          createStringifiedFakeEntity({ fileId: file.fileId }),
        ];

        const response = await entityRequestSender.patchEntities(entities);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });

      it('should return 409 if one of the updateEntitites entities is a duplicate', async function () {
        const entity = createStringifiedFakeEntity({ fileId: file.fileId });

        const response = await entityRequestSender.patchEntities([entity, entity]);

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

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: entityRepositorySymbol,
          provider: { useValue: { createEntity: createEntityMock, findOneEntity: findOneEntityMock, findManyEntites: findManyEntitesMock } },
        });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const response = await mockEntityRequestSender.postEntity(file.fileId as string, createStringifiedFakeEntity());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('POST /file/:fileId/entity/_bulk', function () {
      it('should return 500 if the db throws an error', async function () {
        const createEntitiesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneEntityMock = jest.fn().mockResolvedValue(false);
        const findManyEntitesMock = jest.fn().mockResolvedValue(false);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: entityRepositorySymbol,
          provider: { useValue: { createEntities: createEntitiesMock, findOneEntity: findOneEntityMock, findManyEntites: findManyEntitesMock } },
        });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);
        const body = createStringifiedFakeEntity();

        const response = await mockEntityRequestSender.postEntityBulk(file.fileId as string, [body]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /file/:fileId/entity/:entityId', function () {
      it('should return 500 if the db throws an error', async function () {
        const updateEntitiesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneEntityMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: entityRepositorySymbol,
          provider: { useValue: { updateEntity: updateEntitiesMock, findOneEntity: findOneEntityMock } },
        });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const { entityId, ...updateBody } = createStringifiedFakeEntity();

        const response = await mockEntityRequestSender.patchEntity(file.fileId as string, entityId as string, updateBody);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });

      it('should return 500 when failing to close file due to transaction failure', async function () {
        const fakeEntity = createFakeEntity();
        const fakeFile = createFakeFile();
        const findOneEntityMock = jest.fn().mockResolvedValue(fakeEntity);
        const updateEntityMock = jest.fn();
        const findOneFileMock = jest.fn().mockResolvedValue(fakeFile);
        const tryClosingFileMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: entityRepositorySymbol,
          provider: { useValue: { findOneEntity: findOneEntityMock, updateEntity: updateEntityMock } },
        });
        mockRegisterOptions.override.push({
          token: fileRepositorySymbol,
          provider: { useValue: { findOneFile: findOneFileMock, tryClosingFile: tryClosingFileMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: false } };
        mockRegisterOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfig } });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;
        updateBody.action = ActionType.MODIFY;
        updateBody.status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'transaction failure');
        expect(tryClosingFileMock).toHaveBeenCalledTimes(1);
      });

      it('should return 500 when failing to close file due to transaction failures when retries is configured', async function () {
        const fakeEntity = createFakeEntity();
        const fakeFile = createFakeFile();
        const findOneEntityMock = jest.fn().mockResolvedValue(fakeEntity);
        const updateEntityMock = jest.fn();
        const findOneFileMock = jest.fn().mockResolvedValue(fakeFile);
        const tryClosingFileMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));

        const retries = faker.datatype.number({ min: 1, max: 10 });
        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: entityRepositorySymbol,
          provider: { useValue: { findOneEntity: findOneEntityMock, updateEntity: updateEntityMock } },
        });
        mockRegisterOptions.override.push({
          token: fileRepositorySymbol,
          provider: { useValue: { findOneFile: findOneFileMock, tryClosingFile: tryClosingFileMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries } };
        mockRegisterOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfig } });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;
        updateBody.action = ActionType.MODIFY;
        updateBody.status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`exceeded the number of retries (${retries}).`);
        expect(tryClosingFileMock).toHaveBeenCalledTimes(retries + 1);
      });

      it('should return 500 when failing to close file not due to a transaction failure when retries is configured', async function () {
        const fakeEntity = createFakeEntity();
        const fakeFile = createFakeFile();
        const findOneEntityMock = jest.fn().mockResolvedValue(fakeEntity);
        const updateEntityMock = jest.fn();
        const findOneFileMock = jest.fn().mockResolvedValue(fakeFile);
        const tryClosingFileMock = jest.fn().mockRejectedValue(new QueryFailedError('some query', undefined, new Error('failed')));

        const retries = faker.datatype.number({ min: 1, max: 10 });
        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: entityRepositorySymbol,
          provider: { useValue: { findOneEntity: findOneEntityMock, updateEntity: updateEntityMock } },
        });
        mockRegisterOptions.override.push({
          token: fileRepositorySymbol,
          provider: { useValue: { findOneFile: findOneFileMock, tryClosingFile: tryClosingFileMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries } };
        mockRegisterOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfig } });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;
        updateBody.action = ActionType.MODIFY;
        updateBody.status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`failed`);
        expect(tryClosingFileMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('PATCH /entity/_bulk', function () {
      it('should return 500 if the db throws an error', async function () {
        const updateEntitiesMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const countEntitiesByIdsMock = jest.fn().mockResolvedValue(1);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: entityRepositorySymbol,
          provider: { useValue: { updateEntities: updateEntitiesMock, countEntitiesByIds: countEntitiesByIdsMock } },
        });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);
        const entity = createStringifiedFakeEntity({ fileId: file.fileId });

        const response = await mockEntityRequestSender.patchEntities([entity]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });

      it('should return 500 when failing to close file due to transaction failure', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));
        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: fileRepositorySymbol, provider: { useValue: { tryClosingFile: tryClosingFileMock } } });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: false } };
        mockRegisterOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfig } });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        expect(await entityRequestSender.postEntityBulk(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);

        body[0].action = ActionType.MODIFY;
        body[0].failReason = 'epic failure';
        body[0].fileId = file.fileId;
        body[0].status = EntityStatus.NOT_SYNCED;

        body[1].failReason = 'epic failure';
        body[1].fileId = file.fileId;
        body[1].status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntities(body);

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'transaction failure');
        expect(tryClosingFileMock).toHaveBeenCalledTimes(body.length);
      });

      it('should return 500 when failing to close file due to transaction failures when retries is configured', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));
        const retries = faker.datatype.number({ min: 1, max: 10 });
        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: fileRepositorySymbol, provider: { useValue: { tryClosingFile: tryClosingFileMock } } });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries } };
        mockRegisterOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfig } });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        expect(await entityRequestSender.postEntityBulk(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);

        body[0].action = ActionType.MODIFY;
        body[0].failReason = 'epic failure';
        body[0].fileId = file.fileId;
        body[0].status = EntityStatus.NOT_SYNCED;

        body[1].failReason = 'epic failure';
        body[1].fileId = file.fileId;
        body[1].status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntities(body);

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`exceeded the number of retries (${retries}).`);
        expect(tryClosingFileMock).toHaveBeenCalledTimes((retries + 1) * body.length);
      });

      it('should return 500 when failing to close file not due to a transaction failure when retries is configured', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValue(new QueryFailedError('some query', undefined, new Error('failed')));
        const retries = faker.datatype.number({ min: 1, max: 10 });
        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: fileRepositorySymbol, provider: { useValue: { tryClosingFile: tryClosingFileMock } } });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries } };
        mockRegisterOptions.override.push({ token: Services.APPLICATION, provider: { useValue: appConfig } });
        const mockApp = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        expect(await entityRequestSender.postEntityBulk(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);

        body[0].action = ActionType.MODIFY;
        body[0].failReason = 'epic failure';
        body[0].fileId = file.fileId;
        body[0].status = EntityStatus.NOT_SYNCED;

        body[1].failReason = 'epic failure';
        body[1].fileId = file.fileId;
        body[1].status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntities(body);

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
        expect(tryClosingFileMock).toHaveBeenCalledTimes(body.length);
      });
    });
  });
});
