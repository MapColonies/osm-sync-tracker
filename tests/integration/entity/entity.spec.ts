import { faker } from '@faker-js/faker';
import { DependencyContainer } from 'tsyringe';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { DataSource, QueryFailedError } from 'typeorm';
import lodash from 'lodash';
import { createStringifiedFakeRerunCreateBody, createStringifiedFakeSync } from '../sync/helpers/generators';
import { StringifiedSync } from '../sync/types';
import { SyncRequestSender } from '../sync/helpers/requestSender';
import { FileRequestSender } from '../file/helpers/requestSender';
import { EntityRequestSender } from '../entity/helpers/requestSender';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { StringifiedFile } from '../file/types';
import { ActionType, EntityStatus, Status } from '../../../src/common/enums';
import { getApp } from '../../../src/app';
import { Entity } from '../../../src/entity/models/entity';
import { BEFORE_ALL_TIMEOUT, DEFAULT_ISOLATION_LEVEL, getBaseRegisterOptions, RERUN_TEST_TIMEOUT } from '../helpers';
import { TransactionFailureError } from '../../../src/changeset/models/errors';
import { createFakeEntity, createFakeFile } from '../../helpers/helper';
import { FILE_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/file/DAL/fileRepository';
import { EntityBulkCreationResult } from '../../../src/entity/models/entityManager';
import { IApplication } from '../../../src/common/interfaces';
import { SERVICES } from '../../../src/common/constants';
import { ENTITY_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/entity/DAL/entityRepository';
import { createStringifiedFakeEntity } from './helpers/generators';

describe('entity', function () {
  let entityRequestSender: EntityRequestSender;
  let fileRequestSender: FileRequestSender;
  let syncRequestSender: SyncRequestSender;
  let mockEntityRequestSender: EntityRequestSender;

  let sync: StringifiedSync;
  let file: StringifiedFile;

  let depContainer: DependencyContainer;

  beforeAll(async function () {
    const { app, container } = await getApp(getBaseRegisterOptions());
    depContainer = container;
    entityRequestSender = new EntityRequestSender(app);
    fileRequestSender = new FileRequestSender(app);
    syncRequestSender = new SyncRequestSender(app);
    sync = createStringifiedFakeSync();
    await syncRequestSender.postSync(sync);
    file = createStringifiedFakeFile();
    await fileRequestSender.postFile(sync.id as string, file);
  }, BEFORE_ALL_TIMEOUT);

  afterAll(async function () {
    const connection = depContainer.resolve(DataSource);
    await connection.destroy();
    depContainer.reset();
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
      it('should return 201 status code and body containing all entities as created and no previously completed', async function () {
        const entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        const expectedBody: EntityBulkCreationResult = { created: entities.map((entity) => entity.entityId as string), previouslyCompleted: [] };

        const response = await entityRequestSender.postEntityBulk(file.fileId as string, entities);

        expect(response.status).toBe(StatusCodes.CREATED);
        expect(response.body).toHaveProperty('created', expect.arrayContaining(expectedBody.created));
        expect(response.body).toHaveProperty('previouslyCompleted', expectedBody.previouslyCompleted);
      });

      it('should return 201 status code on entity bulk with same entityId on other fileId', async function () {
        const entity1 = createStringifiedFakeEntity();
        const entity2 = createStringifiedFakeEntity();
        const file2 = createStringifiedFakeFile();
        await fileRequestSender.postFile(sync.id as string, file2);

        expect(await entityRequestSender.postEntityBulk(file.fileId as string, [entity1, entity2])).toHaveStatus(StatusCodes.CREATED);

        const response = await entityRequestSender.postEntityBulk(file2.fileId as string, [entity1, entity2]);

        expect(response).toHaveProperty('status', httpStatus.CREATED);
      });

      it(
        'should return 201 status code and body containing some entities as created and some as previously completed on a rerun',
        async function () {
          const syncForRerun = createStringifiedFakeSync();
          const file = createStringifiedFakeFile();
          const rerunCreateBody = createStringifiedFakeRerunCreateBody({ shouldRerunNotSynced: true });
          const entity1 = createStringifiedFakeEntity({ status: EntityStatus.COMPLETED });
          const entity2 = createStringifiedFakeEntity();

          expect(await syncRequestSender.postSync(syncForRerun)).toHaveStatus(StatusCodes.CREATED);
          expect(await syncRequestSender.patchSync(syncForRerun.id as string, { status: Status.FAILED })).toHaveStatus(StatusCodes.OK);
          expect(await syncRequestSender.rerunSync(syncForRerun.id as string, rerunCreateBody)).toHaveStatus(StatusCodes.CREATED);

          expect(await fileRequestSender.postFile(syncForRerun.id as string, file)).toHaveStatus(StatusCodes.CREATED);

          const firstExpectedBody: EntityBulkCreationResult = { created: [entity1.entityId as string], previouslyCompleted: [] };

          const firstPostEntityBulkResponse = await entityRequestSender.postEntityBulk(file.fileId as string, [entity1]);

          expect(firstPostEntityBulkResponse.status).toBe(StatusCodes.CREATED);
          expect(firstPostEntityBulkResponse.body).toHaveProperty('created', expect.arrayContaining(firstExpectedBody.created));
          expect(firstPostEntityBulkResponse.body).toHaveProperty('previouslyCompleted', firstExpectedBody.previouslyCompleted);

          const secondExpectedBody: EntityBulkCreationResult = {
            created: [entity2.entityId as string],
            previouslyCompleted: [entity1.entityId as string],
          };

          const secondPostEntityBulkResponse = await entityRequestSender.postEntityBulk(file.fileId as string, [entity1, entity2]);

          expect(secondPostEntityBulkResponse.status).toBe(StatusCodes.CREATED);
          expect(secondPostEntityBulkResponse.body).toHaveProperty('created', expect.arrayContaining(secondExpectedBody.created));
          expect(secondPostEntityBulkResponse.body).toHaveProperty('previouslyCompleted', secondExpectedBody.previouslyCompleted);
        },
        RERUN_TEST_TIMEOUT
      );
    });

    describe('PATCH /file/:fileId/entity/:entityId', function () {
      it('should return 200 status code and empty array body', async function () {
        const body = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;

        updateBody.action = ActionType.MODIFY;

        const response = await entityRequestSender.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject([]);
      });

      it('should return 200 status code and OK body when retries is configured', async function () {
        const numOfRetries = faker.datatype.number({ min: 1, max: 10 });
        const appConfigWithRetries: IApplication = {
          transactionRetryPolicy: { enabled: true, numRetries: numOfRetries },
          isolationLevel: DEFAULT_ISOLATION_LEVEL,
        };
        const registerOptions = getBaseRegisterOptions();
        registerOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfigWithRetries } });
        const { app: appWithRetries } = await getApp(registerOptions);
        const entityRequestSenderWithRetries = new EntityRequestSender(appWithRetries);

        const body = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;

        updateBody.action = ActionType.MODIFY;
        updateBody.status = EntityStatus.NOT_SYNCED;

        const response = await entityRequestSenderWithRetries.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject([]);
      });

      it('should return 200 status code when failing close file transaction once while retries is configured', async function () {
        const fakeEntity = createFakeEntity();
        const fakeFile = createFakeFile();
        const findOneEntityMock = jest.fn().mockResolvedValue(fakeEntity);
        const updateEntityMock = jest.fn();
        const findOneFileMock = jest.fn().mockResolvedValue(fakeFile);
        const tryClosingFileMock = jest.fn().mockRejectedValueOnce(new TransactionFailureError('transaction failure')).mockReturnValue([]);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { findOneEntity: findOneEntityMock, updateEntity: updateEntityMock } },
        });
        mockRegisterOptions.override.push({
          token: FILE_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { findOneFile: findOneFileMock, tryClosingFile: tryClosingFileMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: 1 }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);

        const body = createStringifiedFakeEntity();
        expect(await entityRequestSender.postEntity(file.fileId as string, body)).toHaveStatus(StatusCodes.CREATED);
        const { entityId, ...updateBody } = body;
        updateBody.action = ActionType.MODIFY;
        updateBody.status = EntityStatus.NOT_SYNCED;

        const response = await mockEntityRequestSender.patchEntity(file.fileId as string, body.entityId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject([]);
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

      it('should return 200 status code and OK body if entity with same id exist in different file', async function () {
        const newFile = createStringifiedFakeFile();

        expect(await fileRequestSender.postFile(sync.id as string, newFile)).toHaveStatus(StatusCodes.CREATED);
        const entities1 = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        const entities2 = [{ ...entities1[0] }];
        expect(await entityRequestSender.postEntityBulk(file.fileId as string, entities1)).toHaveStatus(StatusCodes.CREATED);
        expect(await entityRequestSender.postEntityBulk(newFile.fileId as string, entities2)).toHaveStatus(StatusCodes.CREATED);

        entities1[0].action = ActionType.MODIFY;
        entities1[0].failReason = 'epic failure';
        entities1[0].fileId = file.fileId;

        entities1[1].failReason = 'epic failure';
        entities1[1].fileId = file.fileId;

        const response = await entityRequestSender.patchEntities(entities1);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });

      it('should return 200 status code and OK body when closing transaction fails once while retries is configured', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValueOnce(new TransactionFailureError('transaction failure'));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: FILE_CUSTOM_REPOSITORY_SYMBOL, provider: { useValue: { tryClosingFile: tryClosingFileMock } } });

        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: 1 }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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

        const uniqueFileIds = lodash.uniqBy(body, 'fileId');

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
        expect(tryClosingFileMock).toHaveBeenCalledTimes(uniqueFileIds.length + 1);
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
        const anotherEntity = createStringifiedFakeEntity();

        const response = await entityRequestSender.postEntityBulk(file.fileId as string, [entity, entity, anotherEntity]);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);

        const message = (response.body as { message: string }).message;
        expect(message).toContain(`entites = [${entity.entityId as string}] are duplicate`);
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
        const findManyEntitiesMock = jest.fn().mockResolvedValue(false);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { createEntity: createEntityMock, findOneEntity: findOneEntityMock, findManyEntites: findManyEntitiesMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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
        const findManyEntitiesByIdsMock = jest.fn().mockResolvedValue(false);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: { createEntities: createEntitiesMock, findOneEntity: findOneEntityMock, findManyEntitiesByIds: findManyEntitiesByIdsMock },
          },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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
          token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { updateEntity: updateEntitiesMock, findOneEntity: findOneEntityMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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
          token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { findOneEntity: findOneEntityMock, updateEntity: updateEntityMock } },
        });
        mockRegisterOptions.override.push({
          token: FILE_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { findOneFile: findOneFileMock, tryClosingFile: tryClosingFileMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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
          token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { findOneEntity: findOneEntityMock, updateEntity: updateEntityMock } },
        });
        mockRegisterOptions.override.push({
          token: FILE_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { findOneFile: findOneFileMock, tryClosingFile: tryClosingFileMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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
          token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { findOneEntity: findOneEntityMock, updateEntity: updateEntityMock } },
        });
        mockRegisterOptions.override.push({
          token: FILE_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { findOneFile: findOneFileMock, tryClosingFile: tryClosingFileMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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
          token: ENTITY_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { updateEntities: updateEntitiesMock, countEntitiesByIds: countEntitiesByIdsMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockEntityRequestSender = new EntityRequestSender(mockApp);
        const entity = createStringifiedFakeEntity({ fileId: file.fileId });

        const response = await mockEntityRequestSender.patchEntities([entity]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });

      it('should return 500 when failing to close file due to transaction failure', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));
        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: FILE_CUSTOM_REPOSITORY_SYMBOL, provider: { useValue: { tryClosingFile: tryClosingFileMock } } });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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

        const uniqueFileIds = lodash.uniqBy(body, 'fileId');

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'transaction failure');
        expect(tryClosingFileMock).toHaveBeenCalledTimes(uniqueFileIds.length);
      });

      it('should return 500 when failing to close file due to transaction failures when retries is configured', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));
        const retries = faker.datatype.number({ min: 1, max: 10 });
        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: FILE_CUSTOM_REPOSITORY_SYMBOL, provider: { useValue: { tryClosingFile: tryClosingFileMock } } });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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

        const uniqueFileIds = lodash.uniqBy(body, 'fileId');

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`exceeded the number of retries (${retries}).`);
        expect(tryClosingFileMock).toHaveBeenCalledTimes((retries + 1) * uniqueFileIds.length);
      });

      it('should return 500 when failing to close file not due to a transaction failure when retries is configured', async function () {
        const tryClosingFileMock = jest.fn().mockRejectedValue(new QueryFailedError('some query', undefined, new Error('failed')));
        const retries = faker.datatype.number({ min: 1, max: 10 });
        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({ token: FILE_CUSTOM_REPOSITORY_SYMBOL, provider: { useValue: { tryClosingFile: tryClosingFileMock } } });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
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

        const uniqueFileIds = lodash.uniqBy(body, 'fileId');

        expect(response.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
        expect(tryClosingFileMock).toHaveBeenCalledTimes(uniqueFileIds.length);
      });
    });
  });
});
