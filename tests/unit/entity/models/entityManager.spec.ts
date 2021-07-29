import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { EntityManager } from '../../../../src/entity/models/entityManager';
import { createFakeEntities, createFakeEntity, createFakeFile } from '../../../helpers/helper';
import { DuplicateEntityError, EntityAlreadyExistsError } from '../../../../src/entity/models/errors';
import { EntityNotFoundError } from '../../../../src/entity/models/errors';
import { FileNotFoundError } from '../../../../src/file/models/errors';
import { UpdateEntities } from '../../../../src/entity/models/entity';
import { EntityStatus } from '../../../../src/common/enums';

let entityManager: EntityManager;

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

    const repository = { createEntity, createEntities, updateEntity, findOneEntity, findManyEntites, updateEntities, countEntitiesByIds };
    const fileRepository = { createFile, createFiles, findOneFile, findManyFiles, tryClosingFile };

    entityManager = new EntityManager(repository, fileRepository, jsLogger({ enabled: false }), { get: jest.fn(), has: jest.fn() });
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
  });

  describe('#updateEntities', () => {
    it("resolves without errors if all of the entitysId's are not already in use by the db", async () => {
      const entities = createFakeEntities(faker.datatype.number());

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);

      const updateBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).resolves.not.toThrow();
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

    it('resolves without errors if one of the entities status is not_synced', async () => {
      const entities = createFakeEntities(faker.datatype.number());
      entities[0].status = EntityStatus.NOT_SYNCED;

      countEntitiesByIds.mockResolvedValue(entities.length);
      updateEntities.mockResolvedValue(undefined);

      const updateBulkPromise = entityManager.updateEntities(entities as UpdateEntities);

      await expect(updateBulkPromise).resolves.not.toThrow();
    });
  });
});
