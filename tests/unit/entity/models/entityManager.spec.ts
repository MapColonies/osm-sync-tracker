import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { QueryFailedError } from 'typeorm';
import { EntityManager } from '../../../../src/entity/models/entityManager';
import { createFakeEntities, createFakeEntity, createFakeFile } from '../../../helpers/helper';
import { DuplicateEntityError, EntityAlreadyExistsError } from '../../../../src/entity/models/errors';
import { EntityNotFoundError } from '../../../../src/entity/models/errors';
import { FileNotFoundError } from '../../../../src/file/models/errors';
import { UpdateEntities } from '../../../../src/entity/models/entity';
import { EntityStatus } from '../../../../src/common/enums';
import { ExceededNumberOfRetriesError, TransactionFailureError } from '../../../../src/changeset/models/errors';
import { IEntityRepository } from '../../../../src/entity/DAL/entityRepository';
import { IFileRepository } from '../../../../src/file/DAL/fileRepository';

let entityManager: EntityManager;
let entityManagerWithRetries: EntityManager;
let entityRepository: IEntityRepository;
let fileRepository: IFileRepository;

describe('EntityManager', () => {
  let createEntity: jest.Mock;
  let createEntities: jest.Mock;
  let updateEntity: jest.Mock;
  let findOneEntity: jest.Mock;
  let findManyEntites: jest.Mock;

  let createFile: jest.Mock;
  let createFiles: jest.Mock;
  let findOneFile: jest.Mock;
  let findManyFiles: jest.Mock;
  let updateEntities: jest.Mock;
  let countEntitiesByIds: jest.Mock;
  let tryClosingFile: jest.Mock;

  beforeEach(() => {
    createEntity = jest.fn();
    createEntities = jest.fn();
    updateEntity = jest.fn();
    findOneEntity = jest.fn();
    findManyEntites = jest.fn();

    createFile = jest.fn();
    createFiles = jest.fn();
    findOneFile = jest.fn();
    findManyFiles = jest.fn();
    updateEntities = jest.fn();
    countEntitiesByIds = jest.fn();
    tryClosingFile = jest.fn();

    entityRepository = { createEntity, createEntities, updateEntity, findOneEntity, findManyEntites, updateEntities, countEntitiesByIds };
    fileRepository = { createFile, createFiles, findOneFile, findManyFiles, tryClosingFile };

    entityManager = new EntityManager(
      entityRepository,
      fileRepository,
      jsLogger({ enabled: false }),
      { get: jest.fn(), has: jest.fn() },
      { transactionRetryPolicy: { enabled: false } }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createEntity', () => {
    it('resolves without errors if entityId is not already in use by the db', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      createEntity.mockResolvedValue(undefined);
      findOneFile.mockResolvedValue(file);

      const createPromise = entityManager.createEntity(file.fileId, entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if entityId already in use by the db', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findOneEntity.mockResolvedValue(entity);

      const createPromise = entityManager.createEntity(file.fileId, entity);

      await expect(createPromise).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('rejects if fileId not exists in the db', async () => {
      const entity = createFakeEntity();

      findOneFile.mockResolvedValue(undefined);

      const createPromise = entityManager.createEntity(faker.datatype.uuid(), entity);

      await expect(createPromise).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('#createEntities', () => {
    it("resolves without errors if all of the entitysId's are not already in use by the db", async () => {
      const entities = createFakeEntities(faker.datatype.number());
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntites.mockResolvedValue(undefined);
      createEntities.mockResolvedValue(undefined);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).resolves.not.toThrow();
    });

    it("rejects if one of the entitysId's already exists in the db", async () => {
      const entities = createFakeEntities(faker.datatype.number());
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntites.mockResolvedValue(entities);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).rejects.toThrow(EntityAlreadyExistsError);
    });

    it("rejects if one of the entitysId's is duplicate", async () => {
      const entities = createFakeEntities(faker.datatype.number());
      entities.push(entities[0]);
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntites.mockResolvedValue(entities);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).rejects.toThrow(DuplicateEntityError);
    });

    it('rejects if fileId is not exists in the db', async () => {
      const entities = createFakeEntities(faker.datatype.number());

      findOneFile.mockResolvedValue(undefined);

      const createBulkPromise = entityManager.createEntities(faker.datatype.uuid(), entities);

      await expect(createBulkPromise).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('#updateEntity', () => {
    it('resolves without errors if the entity exists in the db', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findOneEntity.mockResolvedValue(entity);
      updateEntity.mockResolvedValue(undefined);

      const updatePromise = entityManager.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).resolves.not.toThrow();
    });

    it('resolves without errors if the entity status is not_synced', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();
      entity.status = EntityStatus.NOT_SYNCED;

      findOneFile.mockResolvedValue(file);
      findOneEntity.mockResolvedValue(entity);
      updateEntity.mockResolvedValue(undefined);
      tryClosingFile.mockResolvedValue(undefined);

      const updatePromise = entityManager.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).resolves.not.toThrow();
    });

    it('resolves without errors if the entity exists in the db when transaction has failed once while retries is configured', async () => {
      const entity = createFakeEntity();
      entity.status = EntityStatus.NOT_SYNCED;
      const file = createFakeFile();

      findOneEntity.mockResolvedValue(entity);
      findOneFile.mockResolvedValue(file);
      tryClosingFile.mockRejectedValueOnce(new TransactionFailureError('transaction failure'));
      entityRepository = { ...entityRepository, findOneEntity };
      fileRepository = { ...fileRepository, findOneFile, tryClosingFile };
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, amount: 1 } }
      );

      const updatePromise = entityManagerWithRetries.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).resolves.not.toThrow();
      expect(tryClosingFile).toHaveBeenCalledTimes(2);
    });

    it('rejects if the entity is not exists in the db', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findOneEntity.mockResolvedValue(undefined);

      const updatePromise = entityManager.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).rejects.toThrow(EntityNotFoundError);
    });

    it('rejects if the file is not exists in the db', async () => {
      const entity = createFakeEntity();

      findOneFile.mockResolvedValue(undefined);
      findOneEntity.mockResolvedValue(entity);

      const updatePromise = entityManager.updateEntity(faker.datatype.uuid(), entity.entityId, entity);

      await expect(updatePromise).rejects.toThrow(FileNotFoundError);
    });

    it('rejects with transaction failure error if closing the file has failed', async () => {
      const entity = createFakeEntity();
      entity.status = EntityStatus.NOT_SYNCED;
      const file = createFakeFile();

      findOneEntity.mockResolvedValue(entity);
      findOneFile.mockResolvedValue(file);
      tryClosingFile.mockRejectedValue(new TransactionFailureError('transaction failure'));
      entityRepository = { ...entityRepository, findOneEntity };
      fileRepository = { ...fileRepository, findOneFile, tryClosingFile };
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: false } }
      );

      const updatePromise = entityManagerWithRetries.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).rejects.toThrow(TransactionFailureError);
      expect(tryClosingFile).toHaveBeenCalledTimes(1);
    });

    it('rejects with exceeded number of retries error if closing file has failed when retries is configured', async () => {
      const entity = createFakeEntity();
      entity.status = EntityStatus.NOT_SYNCED;
      const file = createFakeFile();

      findOneEntity.mockResolvedValue(entity);
      findOneFile.mockResolvedValue(file);
      tryClosingFile.mockRejectedValue(new TransactionFailureError('transaction failure'));
      entityRepository = { ...entityRepository, findOneEntity };
      fileRepository = { ...fileRepository, findOneFile, tryClosingFile };
      const retries = faker.datatype.number({ min: 1, max: 10 });
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, amount: retries } }
      );

      const updatePromise = entityManagerWithRetries.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).rejects.toThrow(ExceededNumberOfRetriesError);
      expect(tryClosingFile).toHaveBeenCalledTimes(retries + 1);
    });

    it('rejects without transaction failure error when retries is configured due to another error raising', async () => {
      const entity = createFakeEntity();
      entity.status = EntityStatus.NOT_SYNCED;
      const file = createFakeFile();

      findOneEntity.mockResolvedValue(entity);
      findOneFile.mockResolvedValue(file);
      tryClosingFile.mockRejectedValue(new QueryFailedError('some query', undefined, new Error()));
      entityRepository = { ...entityRepository, findOneEntity };
      fileRepository = { ...fileRepository, findOneFile, tryClosingFile };
      const retries = faker.datatype.number({ min: 1, max: 10 });
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, amount: retries } }
      );

      const updatePromise = entityManagerWithRetries.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).rejects.toThrow(QueryFailedError);
      expect(tryClosingFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('#updateEntities', () => {
    it("resolves without errors if all of the entitysId's are not already in use by the db", async () => {
      const entities = createFakeEntities(faker.datatype.number());

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);

      const updateBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).resolves.not.toThrow();
    });

    it('resolves without errors if one of the entities status is not_synced', async () => {
      const entities = createFakeEntities(faker.datatype.number());
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);

      const updateBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).resolves.not.toThrow();
    });

    it('resolves without errors if one of the entities status is not_synced when retries is configured and failed once', async () => {
      const entities = createFakeEntities(faker.datatype.number());
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValueOnce(new TransactionFailureError('transaction failure'));

      entityRepository = { ...entityRepository, countEntitiesByIds, updateEntities };
      fileRepository = { ...fileRepository, tryClosingFile };

      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, amount: 1 } }
      );

      const updateBulkPromise = entityManagerWithRetries.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).resolves.not.toThrow();
      expect(tryClosingFile).toHaveBeenCalledTimes(2);
    });

    it("rejects if one of the entitysId's is duplicate", async () => {
      const entities = createFakeEntities(faker.datatype.number());
      entities.push(entities[0]);

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);

      const createBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(createBulkPromise).rejects.toThrow(DuplicateEntityError);
    });

    it('rejects if entity id does not exists in the db', async () => {
      const entities = createFakeEntities(faker.datatype.number());

      countEntitiesByIds.mockResolvedValue(entities.length - 1);
      updateEntities.mockResolvedValue(undefined);

      const createBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(createBulkPromise).rejects.toThrow(EntityNotFoundError);
    });

    it('rejects with transaction failure error if closing the files has failed', async () => {
      const entities = createFakeEntities(faker.datatype.number());
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValue(new TransactionFailureError('transaction failure'));

      entityRepository = { ...entityRepository, countEntitiesByIds, updateEntities };
      fileRepository = { ...fileRepository, tryClosingFile };

      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: false } }
      );

      const updateBulkPromise = entityManagerWithRetries.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).rejects.toThrow(TransactionFailureError);
      expect(tryClosingFile).toHaveBeenCalledTimes(1);
    });

    it('rejects with exceeded number of retries error if closing files has failed when retries is configured', async () => {
      const entities = createFakeEntities(faker.datatype.number());
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValue(new TransactionFailureError('transaction failure'));

      entityRepository = { ...entityRepository, countEntitiesByIds, updateEntities };
      fileRepository = { ...fileRepository, tryClosingFile };

      const retries = faker.datatype.number({ min: 1, max: 10 });
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, amount: retries } }
      );

      const updateBulkPromise = entityManagerWithRetries.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).rejects.toThrow(ExceededNumberOfRetriesError);
      expect(tryClosingFile).toHaveBeenCalledTimes(retries + 1);
    });

    it('rejects without transaction failure error when retries is configured due to another error raising', async () => {
      const entities = createFakeEntities(faker.datatype.number());
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValue(new QueryFailedError('some query', undefined, new Error()));

      entityRepository = { ...entityRepository, countEntitiesByIds, updateEntities };
      fileRepository = { ...fileRepository, tryClosingFile };

      const retries = faker.datatype.number({ min: 1, max: 10 });
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, amount: retries } }
      );

      const updateBulkPromise = entityManagerWithRetries.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).rejects.toThrow(QueryFailedError);
      expect(tryClosingFile).toHaveBeenCalledTimes(1);
    });
  });
});
