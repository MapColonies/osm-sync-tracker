import jsLogger from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import { QueryFailedError } from 'typeorm';
import { EntityManager } from '../../../../src/entity/models/entityManager';
import { createFakeEntities, createFakeEntity, createFakeFile, createFakeRerunSync } from '../../../helpers/helper';
import { DuplicateEntityError, EntityAlreadyExistsError } from '../../../../src/entity/models/errors';
import { EntityNotFoundError } from '../../../../src/entity/models/errors';
import { FileNotFoundError } from '../../../../src/file/models/errors';
import { UpdateEntities } from '../../../../src/entity/models/entity';
import { EntityStatus } from '../../../../src/common/enums';
import { ExceededNumberOfRetriesError, TransactionFailureError } from '../../../../src/changeset/models/errors';
import { DEFAULT_ISOLATION_LEVEL } from '../../../integration/helpers';
import { SyncRepository } from '../../../../src/sync/DAL/syncRepository';
import { EntityRepository } from '../../../../src/entity/DAL/entityRepository';
import { FileRepository } from '../../../../src/file/DAL/fileRepository';

let entityManager: EntityManager;
let entityManagerWithRetries: EntityManager;
let entityRepository: EntityRepository;
let fileRepository: FileRepository;
let syncRepository: SyncRepository;

describe('EntityManager', () => {
  const createEntity = jest.fn();
  const createEntities = jest.fn();
  const updateEntity = jest.fn();
  const findOneEntity = jest.fn();
  const findManyEntities = jest.fn();

  const createFile = jest.fn();
  const createFiles = jest.fn();
  const findOneFile = jest.fn();
  const findManyFiles = jest.fn();
  const updateFile = jest.fn();
  const updateEntities = jest.fn();
  const countEntitiesByIds = jest.fn();
  const tryClosingFile = jest.fn();

  const createSync = jest.fn();
  const getLatestSync = jest.fn();
  const updateSync = jest.fn();
  const findOneSync = jest.fn();
  const findSyncs = jest.fn();
  const findOneSyncWithLastRerun = jest.fn();
  const createRerun = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    entityRepository = ({ createEntity, createEntities, updateFile, updateEntity, findOneEntity, findManyEntities, updateEntities, countEntitiesByIds } as unknown) as EntityRepository;
    fileRepository = ({ createFile, createFiles, findOneFile, findManyFiles, tryClosingFile } as unknown) as FileRepository;
    syncRepository = ({ getLatestSync, createSync, updateSync, findOneSync, findSyncs, findOneSyncWithLastRerun, createRerun } as unknown) as SyncRepository;

    entityManager = new EntityManager(
      entityRepository,
      fileRepository,
      syncRepository,
      jsLogger({ enabled: false }),
      { get: jest.fn(), has: jest.fn() },
      { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
    );
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
    it('resolves without errors if all of the entitysIds are not already in use by the db', async () => {
      const entities = createFakeEntities();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntities.mockResolvedValue(undefined);
      createEntities.mockResolvedValue(undefined);
      findSyncs.mockResolvedValue([]);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).resolves.not.toThrow();
      expect(updateEntities).not.toHaveBeenCalled();
      expect(createEntities).toHaveBeenCalledWith(entities.map((entity) => ({ ...entity, fileId: file.fileId })));
    });

    it('resolves without errors if all of the entitysIds are not already in use by the db while having a rerun', async () => {
      const entities = createFakeEntities();
      const file = createFakeFile();
      const rerun = createFakeRerunSync();

      findOneFile.mockResolvedValue(file);
      findManyEntities.mockResolvedValue(undefined);
      findSyncs.mockResolvedValue([rerun]);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).resolves.not.toThrow();
      expect(createEntities).not.toHaveBeenCalled();
      expect(updateEntities).toHaveBeenCalledWith(entities.map((entity) => ({ ...entity, fileId: file.fileId })));
    });

    it('resolves without errors if all of the entitysIds are already in use by the db while having a rerun', async () => {
      const entities = createFakeEntities();
      const file = createFakeFile();
      const rerun = createFakeRerunSync();

      findOneFile.mockResolvedValue(file);
      findManyEntities.mockResolvedValue(entities);
      findSyncs.mockResolvedValue([rerun]);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).resolves.not.toThrow();
      expect(createEntities).not.toHaveBeenCalled();
      expect(updateEntities).toHaveBeenCalledWith([]);
    });

    it('resolves without errors if some of the entitysIds are already in use by the db while having a rerun', async () => {
      const entities = createFakeEntities();
      const entity = createFakeEntity();
      const file = createFakeFile();
      const rerun = createFakeRerunSync();

      findOneFile.mockResolvedValue(file);
      findManyEntities.mockResolvedValue([entity]);
      findSyncs.mockResolvedValue([rerun]);

      const createBulkPromise = entityManager.createEntities(file.fileId, [...entities, entity]);

      await expect(createBulkPromise).resolves.not.toThrow();
      expect(createEntities).not.toHaveBeenCalled();
      expect(updateEntities).toHaveBeenCalledWith(entities.map((entity) => ({ ...entity, fileId: file.fileId })));
    });

    it('resolves without errors if an already existing entity with inrerun status is created on rerun', async () => {
      const entity1 = createFakeEntity();
      const entity2 = createFakeEntity();
      const entities = [entity1, entity2];
      const file = createFakeFile();
      const rerun = createFakeRerunSync();

      findOneFile.mockResolvedValue(file);
      findManyEntities.mockResolvedValue([{ entity2, status: EntityStatus.IN_RERUN }]);
      findSyncs.mockResolvedValue([rerun]);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).resolves.not.toThrow();
      expect(createEntities).not.toHaveBeenCalled();
      expect(updateEntities).toHaveBeenCalledWith(entities.map((entity) => ({ ...entity, fileId: file.fileId })));
    });

    it("rejects if one of the entitysId's already exists in the db", async () => {
      const entities = createFakeEntities();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntities.mockResolvedValue(entities);
      findSyncs.mockResolvedValue([]);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).rejects.toThrow(EntityAlreadyExistsError);
    });

    it("rejects if one of the entitysId's is duplicate", async () => {
      const entities = createFakeEntities();
      entities.push(entities[0]);
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntities.mockResolvedValue(entities);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).rejects.toThrow(DuplicateEntityError);
    });

    it('rejects if fileId is not exists in the db', async () => {
      const entities = createFakeEntities();

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
      entityRepository = ({ ...entityRepository, findOneEntity } as unknown) as EntityRepository;
      fileRepository = ({ ...fileRepository, findOneFile, tryClosingFile } as unknown) as FileRepository;
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, numRetries: 1 }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
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
      entityRepository = ({ ...entityRepository, findOneEntity } as unknown) as EntityRepository;
      fileRepository = { ...fileRepository, findOneFile, tryClosingFile } as unknown as FileRepository;
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
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
      entityRepository = ({ ...entityRepository, findOneEntity } as unknown) as EntityRepository;
      fileRepository = { ...fileRepository, findOneFile, tryClosingFile } as unknown as FileRepository;
      const retries = faker.datatype.number({ min: 1, max: 10 });
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
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
      entityRepository = ({ ...entityRepository, findOneEntity } as unknown) as EntityRepository;
      fileRepository = ( { ...fileRepository, findOneFile, tryClosingFile } as unknown) as FileRepository;
      const retries = faker.datatype.number({ min: 1, max: 10 });
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
      );

      const updatePromise = entityManagerWithRetries.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).rejects.toThrow(QueryFailedError);
      expect(tryClosingFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('#updateEntities', () => {
    it("resolves without errors if all of the entitysId's are not already in use by the db", async () => {
      const entities = createFakeEntities();

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);

      const updateBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).resolves.not.toThrow();
    });

    it('resolves without errors if one of the entities status is not_synced', async () => {
      const entities = createFakeEntities();
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);

      const updateBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).resolves.not.toThrow();
    });

    it('resolves without errors if one of the entities status is not_synced when retries is configured and failed once', async () => {
      const entities = createFakeEntities();
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValueOnce(new TransactionFailureError('transaction failure'));

      entityRepository = ( { ...entityRepository, countEntitiesByIds, updateEntities } as unknown) as EntityRepository;
      fileRepository = ({ ...fileRepository, tryClosingFile } as unknown) as FileRepository;

      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, numRetries: 1 }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
      );

      const updateBulkPromise = entityManagerWithRetries.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).resolves.not.toThrow();
      expect(tryClosingFile).toHaveBeenCalledTimes(2);
    });

    it("rejects if one of the entitysId's is duplicate", async () => {
      const entities = createFakeEntities();
      entities.push(entities[0]);

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);

      const createBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(createBulkPromise).rejects.toThrow(DuplicateEntityError);
    });

    it('rejects if entity id does not exists in the db', async () => {
      const entities = createFakeEntities();

      countEntitiesByIds.mockResolvedValue(entities.length - 1);
      updateEntities.mockResolvedValue(undefined);

      const createBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(createBulkPromise).rejects.toThrow(EntityNotFoundError);
    });

    it('rejects with transaction failure error if closing the files has failed', async () => {
      const entities = createFakeEntities();
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValue(new TransactionFailureError('transaction failure'));

      entityRepository = ( { ...entityRepository, countEntitiesByIds, updateEntities } as unknown) as EntityRepository;
      fileRepository = ({ ...fileRepository, tryClosingFile } as unknown) as FileRepository;

      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: false }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
      );

      const updateBulkPromise = entityManagerWithRetries.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).rejects.toThrow(TransactionFailureError);
      expect(tryClosingFile).toHaveBeenCalledTimes(1);
    });

    it('rejects with exceeded number of retries error if closing files has failed when retries is configured', async () => {
      const entities = createFakeEntities();
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValue(new TransactionFailureError('transaction failure'));

      entityRepository = ({ ...entityRepository, countEntitiesByIds, updateEntities } as unknown) as EntityRepository;
      fileRepository = ({ ...fileRepository, tryClosingFile } as unknown) as FileRepository;

      const retries = faker.datatype.number({ min: 1, max: 10 });
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
      );

      const updateBulkPromise = entityManagerWithRetries.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).rejects.toThrow(ExceededNumberOfRetriesError);
      expect(tryClosingFile).toHaveBeenCalledTimes(retries + 1);
    });

    it('rejects without transaction failure error when retries is configured due to another error raising', async () => {
      const entities = createFakeEntities();
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);
      tryClosingFile.mockRejectedValue(new QueryFailedError('some query', undefined, new Error()));

      fileRepository = ({ ...fileRepository, tryClosingFile } as unknown) as FileRepository;
      entityRepository = ( { ...entityRepository, countEntitiesByIds, updateEntities } as unknown) as EntityRepository;

      const retries = faker.datatype.number({ min: 1, max: 10 });
      entityManagerWithRetries = new EntityManager(
        entityRepository,
        fileRepository,
        syncRepository,
        jsLogger({ enabled: false }),
        { get: jest.fn(), has: jest.fn() },
        { transactionRetryPolicy: { enabled: true, numRetries: retries }, isolationLevel: DEFAULT_ISOLATION_LEVEL }
      );

      const updateBulkPromise = entityManagerWithRetries.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).rejects.toThrow(QueryFailedError);
      expect(tryClosingFile).toHaveBeenCalledTimes(1);
    });
  });
});
