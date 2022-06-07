import httpStatus, { StatusCodes } from 'http-status-codes';
import { faker } from '@faker-js/faker';
import { DependencyContainer } from 'tsyringe';
import { DataSource, QueryFailedError } from 'typeorm';
import { createStringifiedFakeFile } from '../file/helpers/generators';
import { createStringifiedFakeSync } from '../sync/helpers/generators';
import { createStringifiedFakeEntity } from '../entity/helpers/generators';
import { EntityStatus, GeometryType, Status } from '../../../src/common/enums';
import { Sync } from '../../../src/sync/models/sync';
import { getApp } from '../../../src/app';
import { EntityRequestSender } from '../entity/helpers/requestSender';
import { FileRequestSender } from '../file/helpers/requestSender';
import { SyncRequestSender } from '../sync/helpers/requestSender';
import { SERVICES } from '../../../src/common/constants';
import { CHANGESET_CUSTOM_REPOSITORY_SYMBOL } from '../../../src/changeset/DAL/changesetRepository';
import { TransactionFailureError } from '../../../src/changeset/models/errors';
import { BEFORE_ALL_TIMEOUT, DEFAULT_ISOLATION_LEVEL, FLOW_TEST_TIMEOUT, getBaseRegisterOptions } from '../helpers';
import { IApplication } from '../../../src/common/interfaces';
import { ChangesetRequestSender } from './helpers/requestSender';
import { createStringifiedFakeChangeset } from './helpers/generators';

describe('changeset', function () {
  let changesetRequestSender: ChangesetRequestSender;
  let changesetRequestSenderWithRetries: ChangesetRequestSender;
  let entityRequestSenderWithRetries: EntityRequestSender;
  let fileRequestSender: FileRequestSender;
  let syncRequestSender: SyncRequestSender;
  let mockChangesetRequestSender: ChangesetRequestSender;
  let depContainer: DependencyContainer;

  beforeAll(async () => {
    const { app, container } = await getApp(getBaseRegisterOptions());
    depContainer = container;
    changesetRequestSender = new ChangesetRequestSender(app);
    fileRequestSender = new FileRequestSender(app);
    syncRequestSender = new SyncRequestSender(app);

    const numOfRetries = faker.datatype.number({ min: 1, max: 10 });
    const appConfigWithRetries: IApplication = {
      transactionRetryPolicy: { enabled: true, numRetries: numOfRetries },
      isolationLevel: 'SERIALIZABLE',
    };
    const registerOptions = getBaseRegisterOptions();
    registerOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfigWithRetries } });
    const { app: appWithRetries } = await getApp(registerOptions);
    changesetRequestSenderWithRetries = new ChangesetRequestSender(appWithRetries);
    entityRequestSenderWithRetries = new EntityRequestSender(appWithRetries);
  }, BEFORE_ALL_TIMEOUT);

  afterAll(async function () {
    const connection = depContainer.resolve(DataSource);
    await connection.destroy();
    depContainer.reset();
  });

  describe('Happy Path', function () {
    describe('POST /changeset', function () {
      it('should return 201 status code and Created body', async function () {
        const body = createStringifiedFakeChangeset();
        const response = await changesetRequestSender.postChangeset(body);

        expect(response.status).toBe(httpStatus.CREATED);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
      });
    });

    describe('PATCH /changeset/{changesetId}', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeChangeset();

        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);
        const { changesetId, ...updateBody } = body;

        updateBody.osmId = faker.datatype.number();

        const response = await changesetRequestSender.patchChangeset(changesetId as string, updateBody);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('PATCH /changeset/{changesetId}/entities', function () {
      it('should return 200 status code and OK body', async function () {
        const changeset = createStringifiedFakeChangeset();

        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        const response = await changesetRequestSender.patchChangesetEntities(changeset.changesetId as string);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('PUT /changeset/{changesetId}/close', function () {
      it('should return 200 status code and OK body', async function () {
        const body = createStringifiedFakeChangeset();
        await changesetRequestSender.postChangeset(body);

        const response = await changesetRequestSender.putChangeset(body.changesetId as string);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });

      it('should return 200 status code and OK body when retries is configured', async function () {
        const body = createStringifiedFakeChangeset();
        await changesetRequestSenderWithRetries.postChangeset(body);

        const response = await changesetRequestSenderWithRetries.putChangeset(body.changesetId as string);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });

      it('should return 200 status code and OK body when transaction retries is enabled and transaction fails once', async function () {
        const tryClosingChangesetMock = jest.fn().mockRejectedValueOnce(new TransactionFailureError('transaction failure'));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangeset: tryClosingChangesetMock, findOneChangeset: findOneChangesetMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: 1 }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);
        const body = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangeset(body.changesetId as string);

        expect(response.status).toBe(StatusCodes.OK);
        expect(tryClosingChangesetMock).toHaveBeenCalledTimes(2);
        expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
      });
    });

    describe('PUT /changeset/close/_bulk', function () {
      it('should return 200 status code and empty array body', async function () {
        const changeset1 = createStringifiedFakeChangeset();
        const changeset2 = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);
        expect(await changesetRequestSender.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);

        const response = await changesetRequestSender.putChangesets([changeset1.changesetId as string, changeset2.changesetId as string]);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject([]);
      });

      it('should return 200 status code and empty array body when retries is configured', async function () {
        const changeset1 = createStringifiedFakeChangeset();
        const changeset2 = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);
        expect(await changesetRequestSender.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);

        const response = await changesetRequestSenderWithRetries.putChangesets([changeset1.changesetId as string, changeset2.changesetId as string]);

        expect(response.status).toBe(httpStatus.OK);
        expect(response.body).toMatchObject([]);
      });

      it('should return 200 status code and OK body when transaction retries is enabled and transaction fails once', async function () {
        const tryClosingChangesetsMock = jest.fn().mockRejectedValueOnce(new TransactionFailureError('transaction failure')).mockReturnValue([]);
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangesets: tryClosingChangesetsMock, findOneChangeset: findOneChangesetMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: 1 }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);
        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangesets([changeset.changesetId as string]);

        expect(response.status).toBe(StatusCodes.OK);
        expect(tryClosingChangesetsMock).toHaveBeenCalledTimes(2);
        expect(response.body).toMatchObject([]);
      });
    });
  });

  describe('Bad Path', function () {
    describe('POST /changeset', function () {
      it('should return 400 if the changesetid is not valid', async function () {
        const body = createStringifiedFakeChangeset({ changesetId: faker.random.word() });
        const response = await changesetRequestSender.postChangeset(body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.changesetId should match format "uuid"');
      });

      it('should return 400 if a required property is missing', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await changesetRequestSender.postChangeset(body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', "request.body should have required property 'changesetId'");
      });

      it('should return 409 if a chnageset already exists', async function () {
        const body = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const response = await changesetRequestSender.postChangeset(body);

        expect(response).toHaveProperty('status', httpStatus.CONFLICT);
      });
    });

    describe('PATCH /changeset/{changesetId}', function () {
      it('should return 400 if the id is not valid', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await changesetRequestSender.patchChangeset(faker.random.word(), body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.changesetId should match format "uuid"');
      });

      it('should return 400 if a osmId is not valid', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset({ osmId: faker.random.word() });

        const response = await changesetRequestSender.patchChangeset(changesetId as string, body);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body.osmId should be integer');
      });

      it('should return 404 if no changeset with the specified id was found', async function () {
        const { changesetId, ...body } = createStringifiedFakeChangeset();

        const response = await changesetRequestSender.patchChangeset(faker.datatype.uuid(), body);

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('PATCH /changeset/{changesetId}/entities', function () {
      it('should return 400 if the id is not valid', async function () {
        const response = await changesetRequestSender.patchChangesetEntities(faker.random.word());

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.changesetId should match format "uuid"');
      });

      it('should return 404 if no changeset with the specified id was found', async function () {
        const response = await changesetRequestSender.patchChangesetEntities(faker.datatype.uuid());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('PUT /changeset/{changesetId}/close', function () {
      it('should return 400 if the id is not valid', async function () {
        const response = await changesetRequestSender.putChangeset(faker.random.word());

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.params.changesetId should match format "uuid"');
      });

      it('should return 404 if no changeset with the specified id was found', async function () {
        const response = await changesetRequestSender.putChangeset(faker.datatype.uuid());

        expect(response).toHaveProperty('status', httpStatus.NOT_FOUND);
      });
    });

    describe('PUT /changeset/close/_bulk', function () {
      it('should return 400 if the id is not valid', async function () {
        const response = await changesetRequestSender.putChangesets([faker.random.word()]);

        expect(response).toHaveProperty('status', httpStatus.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'request.body[0] should match format "uuid"');
      });
    });
  });

  describe('Sad Path', function () {
    describe('POST /changeset', function () {
      it('should return 500 if the db throws an error', async function () {
        const createChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMock = jest.fn().mockResolvedValue(false);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { createChangeset: createChangesetMock, findOneChangeset: findOneChangesetMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const response = await mockChangesetRequestSender.postChangeset(createStringifiedFakeChangeset());

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /changeset/{changeset}', function () {
      it('should return 500 if the db throws an error', async function () {
        const updateChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { updateChangeset: updateChangesetMock, findOneChangeset: findOneChangesetMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);
        const body = createStringifiedFakeChangeset();

        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const { changesetId, ...updateBody } = body;
        const response = await mockChangesetRequestSender.patchChangeset(changesetId as string, updateBody);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PATCH /changeset/{changeset}/entities', function () {
      it('should return 500 if the db throws an error', async function () {
        const updateEntitiesOfChangesetAsCompletedMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: {
            useValue: { updateEntitiesOfChangesetAsCompleted: updateEntitiesOfChangesetAsCompletedMock, findOneChangeset: findOneChangesetMock },
          },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);
        const changeset = createStringifiedFakeChangeset();

        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        const { changesetId } = changeset;
        const response = await mockChangesetRequestSender.patchChangesetEntities(changesetId as string);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });
    });

    describe('PUT /changeset/{changesetId}/close', function () {
      it('should return 500 if the db throws an error', async function () {
        const tryClosingChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangeset: tryClosingChangesetMock, findOneChangeset: findOneChangesetMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const body = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangeset(body.changesetId as string);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });

      it('should return 500 if transaction failure occurs with transaction retries not enabled', async function () {
        const tryClosingChangesetMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangeset: tryClosingChangesetMock, findOneChangeset: findOneChangesetMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const body = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangeset(body.changesetId as string);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(tryClosingChangesetMock).toHaveBeenCalledTimes(1);
        expect(response.body).toHaveProperty('message', 'transaction failure');
      });

      it('should return 500 if transaction failure occurs on multiple retries', async function () {
        const tryClosingChangesetMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangeset: tryClosingChangesetMock, findOneChangeset: findOneChangesetMock } },
        });
        const retries = faker.datatype.number({ min: 1, max: 10 });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const body = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangeset(body.changesetId as string);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(tryClosingChangesetMock).toHaveBeenCalledTimes(retries + 1);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`exceeded the number of retries (${retries}).`);
      });

      it('should return 500 without transaction failure error on multiple retries due to another error raising', async function () {
        const tryClosingChangesetMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));
        const findOneChangesetMock = jest.fn().mockResolvedValue(true);

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangeset: tryClosingChangesetMock, findOneChangeset: findOneChangesetMock } },
        });
        const retries = faker.datatype.number({ min: 1, max: 10 });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const body = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(body)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangeset(body.changesetId as string);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(tryClosingChangesetMock).toHaveBeenCalledTimes(1);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`failed`);
      });
    });

    describe('PUT /changeset/close/_bulk', function () {
      it('should return 500 if the db throws an error', async function () {
        const tryClosingChangesetsMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangesets: tryClosingChangesetsMock } },
        });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const changeset1 = createStringifiedFakeChangeset();
        const changeset2 = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);
        expect(await changesetRequestSender.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangesets([changeset1.changesetId as string, changeset2.changesetId as string]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message', 'failed');
      });

      it('should return 500 if transaction failure occurs with transaction retries not enabled', async function () {
        const tryClosingChangesetsMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangesets: tryClosingChangesetsMock } },
        });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangesets([changeset.changesetId as string]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(tryClosingChangesetsMock).toHaveBeenCalledTimes(1);
        expect(response.body).toHaveProperty('message', 'transaction failure');
      });

      it('should return 500 if transaction failure occurs on multiple retries', async function () {
        const tryClosingChangesetsMock = jest.fn().mockRejectedValue(new TransactionFailureError('transaction failure'));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangesets: tryClosingChangesetsMock } },
        });
        const retries = faker.datatype.number({ min: 1, max: 10 });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangesets([changeset.changesetId as string]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(tryClosingChangesetsMock).toHaveBeenCalledTimes(retries + 1);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`exceeded the number of retries (${retries}).`);
      });

      it('should return 500 without transaction failure error on multiple retries due to another error raising', async function () {
        const tryClosingChangesetsMock = jest.fn().mockRejectedValue(new QueryFailedError('select *', [], new Error('failed')));

        const mockRegisterOptions = getBaseRegisterOptions();
        mockRegisterOptions.override.push({
          token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL,
          provider: { useValue: { tryClosingChangesets: tryClosingChangesetsMock } },
        });
        const retries = faker.datatype.number({ min: 1, max: 10 });
        const appConfig: IApplication = { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL };
        mockRegisterOptions.override.push({ token: SERVICES.APPLICATION, provider: { useValue: appConfig } });
        const { app: mockApp } = await getApp(mockRegisterOptions);
        mockChangesetRequestSender = new ChangesetRequestSender(mockApp);

        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSender.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        const response = await mockChangesetRequestSender.putChangesets([changeset.changesetId as string]);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(tryClosingChangesetsMock).toHaveBeenCalledTimes(1);
        const message = (response.body as { message: string }).message;
        expect(message).toContain(`failed`);
      });
    });
  });

  describe('Flow', function () {
    it(
      'should create sync, files, entities, changeset and close it',
      async function () {
        // create a sync
        const sync = createStringifiedFakeSync({ totalFiles: 2 });
        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create two files with 6 entities overall
        const file1 = createStringifiedFakeFile({ totalEntities: 2 });
        const file2 = createStringifiedFakeFile({ totalEntities: 4 });
        expect(await fileRequestSender.postFile(sync.id as string, file1)).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFile(sync.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        // create the entities, one of them won't be synced
        const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        let file2Entities = [
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
        ];
        expect(await entityRequestSenderWithRetries.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
        expect(await entityRequestSenderWithRetries.postEntityBulk(file2.fileId as string, file2Entities)).toHaveStatus(StatusCodes.CREATED);
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
        expect(await changesetRequestSenderWithRetries.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        expect(await changesetRequestSenderWithRetries.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);

        // patch all entities except the not synced one, the sync should not complete yet
        const patchBody = [...file1Entities, ...file2Entities].map((entity, index) => ({
          entityId: entity.entityId,
          fileId: entity.fileId,
          changesetId: index % 2 === 0 ? changeset1.changesetId : changeset2.changesetId,
        }));
        expect(await entityRequestSenderWithRetries.patchEntities(patchBody)).toHaveStatus(StatusCodes.OK);
        expect(await changesetRequestSenderWithRetries.putChangeset(changeset1.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        expect(await changesetRequestSenderWithRetries.putChangeset(changeset2.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch the not synced entity should complete the sync
        const patchEntityResponse = await entityRequestSenderWithRetries.patchEntity(
          notSyncedEntity.fileId as string,
          notSyncedEntity.entityId as string,
          {
            status: EntityStatus.NOT_SYNCED,
          }
        );
        expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchEntityResponse.body).toMatchObject([sync.id]);

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveStatus(StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      FLOW_TEST_TIMEOUT
    );

    it(
      'should create sync, files, entities, changeset and close it by closing the entities and then the changeset',
      async function () {
        // create a sync
        const sync = createStringifiedFakeSync({ totalFiles: 2 });
        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create two files with 6 entities overall
        const file1 = createStringifiedFakeFile({ totalEntities: 2 });
        const file2 = createStringifiedFakeFile({ totalEntities: 4 });
        expect(await fileRequestSender.postFile(sync.id as string, file1)).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFile(sync.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        // create the entities, one of them won't be synced
        const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        let file2Entities = [
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
          createStringifiedFakeEntity(),
        ];
        expect(await entityRequestSenderWithRetries.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
        expect(await entityRequestSenderWithRetries.postEntityBulk(file2.fileId as string, file2Entities)).toHaveStatus(StatusCodes.CREATED);
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
        expect(await changesetRequestSenderWithRetries.postChangeset(changeset1)).toHaveStatus(StatusCodes.CREATED);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        expect(await changesetRequestSenderWithRetries.postChangeset(changeset2)).toHaveStatus(StatusCodes.CREATED);

        // patch all entities except the not synced one, the sync should not complete yet
        const patchBody = [...file1Entities, ...file2Entities].map((entity, index) => ({
          entityId: entity.entityId,
          fileId: entity.fileId,
          changesetId: index % 2 === 0 ? changeset1.changesetId : changeset2.changesetId,
        }));
        expect(await entityRequestSenderWithRetries.patchEntities(patchBody)).toHaveStatus(StatusCodes.OK);

        let putChangesetsResponse = await changesetRequestSenderWithRetries.putChangesets([
          changeset1.changesetId as string,
          changeset2.changesetId as string,
        ]);
        expect(putChangesetsResponse).toHaveStatus(StatusCodes.OK);
        expect(putChangesetsResponse.body).toMatchObject([]);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch the not synced entity should complete the sync
        const patchEntityResponse = await entityRequestSenderWithRetries.patchEntity(
          notSyncedEntity.fileId as string,
          notSyncedEntity.entityId as string,
          {
            status: EntityStatus.NOT_SYNCED,
          }
        );
        expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchEntityResponse.body).toMatchObject([]);

        expect(await changesetRequestSenderWithRetries.patchChangesetEntities(changeset1.changesetId as string)).toHaveStatus(StatusCodes.OK);
        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );
        expect(await changesetRequestSenderWithRetries.patchChangesetEntities(changeset2.changesetId as string)).toHaveStatus(StatusCodes.OK);
        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );
        putChangesetsResponse = await changesetRequestSenderWithRetries.putChangesets([
          changeset1.changesetId as string,
          changeset2.changesetId as string,
        ]);
        expect(putChangesetsResponse).toHaveStatus(StatusCodes.OK);
        expect(putChangesetsResponse.body).toMatchObject([sync.id]);

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveStatus(StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      FLOW_TEST_TIMEOUT
    );
  });

  describe('Flow with mixed synced and not synced entities', function () {
    it(
      'should create a sync with not synced entity that should complete the file and the sync',
      async function () {
        // create sync
        const sync = createStringifiedFakeSync({ totalFiles: 1 });
        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create file with 2 entities
        const file = createStringifiedFakeFile({ totalEntities: 2 });
        expect(await fileRequestSender.postFile(sync.id as string, file)).toHaveStatus(StatusCodes.CREATED);

        // create entities, one will be synced the other won't
        const fileEntities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        expect(await entityRequestSenderWithRetries.postEntityBulk(file.fileId as string, fileEntities)).toHaveStatus(StatusCodes.CREATED);

        fileEntities.forEach((entity) => {
          entity.fileId = file.fileId;
        });

        const [notSyncedEntity, syncedEntity] = fileEntities;

        // create changeset
        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSenderWithRetries.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        // patch the first entity, the sync shouldn't complete
        const patchSyncedEntityResponse = await entityRequestSenderWithRetries.patchEntity(
          syncedEntity.fileId as string,
          syncedEntity.entityId as string,
          {
            changesetId: changeset.changesetId as string,
          }
        );
        expect(patchSyncedEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchSyncedEntityResponse.body).toMatchObject([]);
        expect(await changesetRequestSenderWithRetries.putChangeset(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch the other entity as not synced should complete the whole sync
        const patchNotSyncedEntityResponse = await entityRequestSenderWithRetries.patchEntity(
          file.fileId as string,
          notSyncedEntity.entityId as string,
          {
            status: EntityStatus.NOT_SYNCED,
          }
        );
        expect(patchNotSyncedEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchNotSyncedEntityResponse.body).toMatchObject([sync.id]);

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveStatus(StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      FLOW_TEST_TIMEOUT
    );

    it(
      'should create a sync with not synced entity that should not complete the file and the sync',
      async function () {
        // create sync
        const sync = createStringifiedFakeSync({ totalFiles: 1 });
        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create file with 2 entities
        const file = createStringifiedFakeFile({ totalEntities: 2 });
        expect(await fileRequestSender.postFile(sync.id as string, file)).toHaveStatus(StatusCodes.CREATED);

        // create entities, one will be synced the other won't
        const fileEntities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        expect(await entityRequestSenderWithRetries.postEntityBulk(file.fileId as string, fileEntities)).toHaveStatus(StatusCodes.CREATED);

        fileEntities.forEach((entity) => {
          entity.fileId = file.fileId;
        });

        const [notSyncedEntity, syncedEntity] = fileEntities;

        // create changeset
        const changeset = createStringifiedFakeChangeset();
        expect(await changesetRequestSenderWithRetries.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        // patch the first not synced entity, the sync shouldn't complete
        let patchEntityResponse = await entityRequestSenderWithRetries.patchEntity(file.fileId as string, notSyncedEntity.entityId as string, {
          status: EntityStatus.NOT_SYNCED,
        });
        expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchEntityResponse.body).toMatchObject([]);
        expect(await changesetRequestSenderWithRetries.putChangeset(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch the other entity as synced. this should complete the whole sync
        patchEntityResponse = await entityRequestSenderWithRetries.patchEntity(syncedEntity.fileId as string, syncedEntity.entityId as string, {
          changesetId: changeset.changesetId as string,
        });
        expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchEntityResponse.body).toMatchObject([]);
        expect(await changesetRequestSenderWithRetries.putChangeset(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveStatus(StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      FLOW_TEST_TIMEOUT
    );

    it(
      'should create a sync with not synced entity that should only complete the file but not the whole sync',
      async function () {
        // create sync
        const sync = createStringifiedFakeSync({ totalFiles: 2 });

        expect(await syncRequestSender.postSync(sync)).toHaveStatus(StatusCodes.CREATED);

        // create 2 files
        const file1 = createStringifiedFakeFile({ totalEntities: 2 });
        const file2 = createStringifiedFakeFile({ totalEntities: 1 });

        expect(await fileRequestSender.postFile(sync.id as string, file1)).toHaveStatus(StatusCodes.CREATED);
        expect(await fileRequestSender.postFile(sync.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

        // create 3 entities, file 1 entities will be synced and not synced, file2 entity will be synced last
        const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
        const file2Entity = createStringifiedFakeEntity();

        expect(await entityRequestSenderWithRetries.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
        expect(await entityRequestSenderWithRetries.postEntity(file2.fileId as string, file2Entity)).toHaveStatus(StatusCodes.CREATED);

        file1Entities.forEach((entity) => {
          entity.fileId = file1.fileId;
        });

        const [notSyncedEntity, syncedEntity] = file1Entities;

        // create changeset
        const changeset = createStringifiedFakeChangeset();

        expect(await changesetRequestSenderWithRetries.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

        // patch first synced entity of file1
        let patchEntityResponse = await entityRequestSenderWithRetries.patchEntity(syncedEntity.fileId as string, syncedEntity.entityId as string, {
          changesetId: changeset.changesetId as string,
        });
        expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchEntityResponse.body).toMatchObject([]);
        expect(await changesetRequestSenderWithRetries.putChangeset(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch second not synced entity of file1. will close the file but not the sync
        patchEntityResponse = await entityRequestSenderWithRetries.patchEntity(notSyncedEntity.fileId as string, notSyncedEntity.entityId as string, {
          status: EntityStatus.NOT_SYNCED,
        });
        expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchEntityResponse.body).toMatchObject([]);
        expect(await changesetRequestSenderWithRetries.putChangeset(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        expect(await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType)).toHaveProperty(
          'body.status',
          Status.IN_PROGRESS
        );

        // patch the last entity, should close the sync
        patchEntityResponse = await entityRequestSenderWithRetries.patchEntity(file2.fileId as string, file2Entity.entityId as string, {
          changesetId: changeset.changesetId as string,
        });
        expect(patchEntityResponse).toHaveStatus(StatusCodes.OK);
        expect(patchEntityResponse.body).toMatchObject([]);
        expect(await changesetRequestSenderWithRetries.putChangeset(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

        const latestSyncResponse = await syncRequestSender.getLatestSync(sync.layerId as number, sync.geometryType as GeometryType);

        expect(latestSyncResponse).toHaveProperty('status', StatusCodes.OK);
        expect(latestSyncResponse).toHaveProperty('body.status', Status.COMPLETED);
        expect(latestSyncResponse).toHaveProperty('body.endDate');
        expect((latestSyncResponse.body as Sync).endDate).not.toBeNull();
      },
      FLOW_TEST_TIMEOUT
    );
  });

  it(
    'should create two syncs and close them in the same changeset',
    async function () {
      // create 2 syncs
      const sync1 = createStringifiedFakeSync({ totalFiles: 1, isFull: false });
      const sync2 = createStringifiedFakeSync({ totalFiles: 1, isFull: false });

      expect(await syncRequestSender.postSync(sync1)).toHaveStatus(StatusCodes.CREATED);
      expect(await syncRequestSender.postSync(sync2)).toHaveStatus(StatusCodes.CREATED);

      // create 2 files
      const file1 = createStringifiedFakeFile({ totalEntities: 2 });
      const file2 = createStringifiedFakeFile({ totalEntities: 1 });

      expect(await fileRequestSender.postFile(sync1.id as string, file1)).toHaveStatus(StatusCodes.CREATED);
      expect(await fileRequestSender.postFile(sync2.id as string, file2)).toHaveStatus(StatusCodes.CREATED);

      // create 3 entities
      const file1Entities = [createStringifiedFakeEntity(), createStringifiedFakeEntity()];
      const file2Entity = createStringifiedFakeEntity();

      expect(await entityRequestSenderWithRetries.postEntityBulk(file1.fileId as string, file1Entities)).toHaveStatus(StatusCodes.CREATED);
      expect(await entityRequestSenderWithRetries.postEntity(file2.fileId as string, file2Entity)).toHaveStatus(StatusCodes.CREATED);

      file1Entities[0].fileId = file1.fileId;
      file1Entities[1].fileId = file1.fileId;
      file2Entity.fileId = file2.fileId;

      // create changeset
      const changeset = createStringifiedFakeChangeset();
      expect(await changesetRequestSenderWithRetries.postChangeset(changeset)).toHaveStatus(StatusCodes.CREATED);

      // patch all entities of both syncs to have the same changeset
      const patchBody = [...file1Entities, file2Entity].map((entity) => ({
        entityId: entity.entityId,
        fileId: entity.fileId,
        changesetId: changeset.changesetId,
      }));
      expect(await entityRequestSenderWithRetries.patchEntities(patchBody)).toHaveStatus(StatusCodes.OK);

      // expect(await changesetRequestSenderWithRetries.putChangeset(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);
      expect(await changesetRequestSenderWithRetries.patchChangesetEntities(changeset.changesetId as string)).toHaveStatus(StatusCodes.OK);

      expect(await syncRequestSender.getLatestSync(sync1.layerId as number, sync1.geometryType as GeometryType)).toHaveProperty(
        'body.status',
        Status.IN_PROGRESS
      );
      expect(await syncRequestSender.getLatestSync(sync2.layerId as number, sync2.geometryType as GeometryType)).toHaveProperty(
        'body.status',
        Status.IN_PROGRESS
      );

      // try closing the changeset which will close the files and the syncs
      const putChangesetsResponse = await changesetRequestSenderWithRetries.putChangesets([changeset.changesetId as string]);
      expect(putChangesetsResponse).toHaveStatus(StatusCodes.OK);
      expect(putChangesetsResponse.body).toEqual(expect.arrayContaining([sync1.id, sync2.id]));

      const latestSyncLayer1Response = await syncRequestSender.getLatestSync(sync1.layerId as number, sync1.geometryType as GeometryType);
      const latestSyncLayer2Response = await syncRequestSender.getLatestSync(sync2.layerId as number, sync2.geometryType as GeometryType);

      expect(latestSyncLayer1Response).toHaveProperty('status', StatusCodes.OK);
      expect(latestSyncLayer1Response).toHaveProperty('body.status', Status.COMPLETED);
      expect(latestSyncLayer1Response).toHaveProperty('body.endDate');
      expect((latestSyncLayer1Response.body as Sync).endDate).not.toBeNull();

      expect(latestSyncLayer2Response).toHaveProperty('status', StatusCodes.OK);
      expect(latestSyncLayer2Response).toHaveProperty('body.status', Status.COMPLETED);
      expect(latestSyncLayer2Response).toHaveProperty('body.endDate');
      expect((latestSyncLayer2Response.body as Sync).endDate).not.toBeNull();
    },
    FLOW_TEST_TIMEOUT
  );
});
