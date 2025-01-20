import jsLogger from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import { EntityManager } from '../../../../src/entity/models/entityManager';
import { createFakeEntities, createFakeEntity, createFakeFile, createFakeRerunSync } from '../../../helpers/helper';
import { DuplicateEntityError, EntityAlreadyExistsError } from '../../../../src/entity/models/errors';
import { EntityNotFoundError } from '../../../../src/entity/models/errors';
import { FileNotFoundError } from '../../../../src/file/models/errors';
import { UpdateEntities } from '../../../../src/entity/models/entity';
import { EntityStatus } from '../../../../src/common/enums';
import { SyncRepository } from '../../../../src/sync/DAL/syncRepository';
import { EntityRepository } from '../../../../src/entity/DAL/entityRepository';
import { FileRepository } from '../../../../src/file/DAL/fileRepository';

let entityManager: EntityManager;
let entityRepository: EntityRepository;
let fileRepository: FileRepository;
let syncRepository: SyncRepository;

describe('EntityManager', () => {
  const createEntity = jest.fn();
  const createEntities = jest.fn();
  const updateEntity = jest.fn();
  const findOneEntity = jest.fn();
  const findManyEntitiesByIds = jest.fn();

  const createFile = jest.fn();
  const createFiles = jest.fn();
  const findOneFile = jest.fn();
  const findManyFiles = jest.fn();
  const updateFile = jest.fn();
  const updateEntities = jest.fn();
  const countEntitiesByIds = jest.fn();

  const createSync = jest.fn();
  const getLatestSync = jest.fn();
  const updateSync = jest.fn();
  const findOneSync = jest.fn();
  const findSyncs = jest.fn();
  const findOneSyncWithLastRerun = jest.fn();
  const createRerun = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    entityRepository = {
      createEntity,
      createEntities,
      updateFile,
      updateEntity,
      findOneEntity,
      findManyEntitiesByIds,
      updateEntities,
      countEntitiesByIds,
    } as unknown as EntityRepository;

    fileRepository = { createFile, createFiles, findOneFile, findManyFiles } as unknown as FileRepository;

    syncRepository = {
      getLatestSync,
      createSync,
      updateSync,
      findOneSync,
      findSyncs,
      findOneSyncWithLastRerun,
      createRerun,
    } as unknown as SyncRepository;

    entityManager = new EntityManager(entityRepository, fileRepository, syncRepository, jsLogger({ enabled: false }));
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

      const createPromise = entityManager.createEntity(faker.string.uuid(), entity);

      await expect(createPromise).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('#createEntities', () => {
    it('resolves without errors if all of the entitysIds are not already in use by the db', async () => {
      const entities = createFakeEntities();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntitiesByIds.mockResolvedValue(undefined);
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
      findManyEntitiesByIds.mockResolvedValue(undefined);
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
      findManyEntitiesByIds.mockResolvedValue(entities);
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
      findManyEntitiesByIds.mockResolvedValue([entity]);
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
      findManyEntitiesByIds.mockResolvedValue([{ entity2, status: EntityStatus.IN_RERUN }]);
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
      findManyEntitiesByIds.mockResolvedValue(entities);
      findSyncs.mockResolvedValue([]);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).rejects.toThrow(EntityAlreadyExistsError);
    });

    it("rejects if one of the entitysId's is duplicate", async () => {
      const entities = createFakeEntities();
      entities.push(entities[0]);
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntitiesByIds.mockResolvedValue(entities);

      const createBulkPromise = entityManager.createEntities(file.fileId, entities);

      await expect(createBulkPromise).rejects.toThrow(DuplicateEntityError);
    });

    it('rejects if fileId is not exists in the db', async () => {
      const entities = createFakeEntities();

      findOneFile.mockResolvedValue(undefined);

      const createBulkPromise = entityManager.createEntities(faker.string.uuid(), entities);

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

      const updatePromise = entityManager.updateEntity(file.fileId, entity.entityId, entity);

      await expect(updatePromise).resolves.not.toThrow();
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

      const updatePromise = entityManager.updateEntity(faker.string.uuid(), entity.entityId, entity);

      await expect(updatePromise).rejects.toThrow(FileNotFoundError);
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
  });
});
