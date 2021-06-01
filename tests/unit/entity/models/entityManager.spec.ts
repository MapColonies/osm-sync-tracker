import jsLogger from '@map-colonies/js-logger';
import faker from 'faker';
import { EntityManager } from '../../../../src/entity/models/entityManager';
import { createFakeEntities, createFakeEntity, createFakeFile } from '../../../helpers/helper';
import { EntityAlreadyExistsError } from '../../../../src/entity/models/errors';
import { EntityNotFoundError } from '../../../../src/entity/models/errors';
import { FileNotFoundError } from '../../../../src/file/models/errors';

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

    const repository = { createEntity, createEntities, updateEntity, findOneEntity, findManyEntites };
    const fileRepository = { createFile, createFiles, findOneFile, findManyFiles };

    entityManager = new EntityManager(repository, fileRepository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createEntity', () => {
    it('resolves without errors if entityId are not used', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      createEntity.mockResolvedValue(undefined);
      findOneFile.mockResolvedValue(file);

      const createPromise = entityManager.createEntity(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if entityId already exists', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findOneEntity.mockResolvedValue(entity);

      const createPromise = entityManager.createEntity(entity);

      await expect(createPromise).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('rejects if fileId not exists', async () => {
      const entity = createFakeEntity();

      findOneFile.mockResolvedValue(undefined);

      const createPromise = entityManager.createEntity(entity);

      await expect(createPromise).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('#createEntities', () => {
    it("resolves without errors if entityId's are not used", async () => {
      const entities = createFakeEntities(faker.datatype.number());
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntites.mockResolvedValue(undefined);
      createEntities.mockResolvedValue(undefined);

      const createPromise = entityManager.createEntities(entities);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if entityId already exists', async () => {
      const entities = createFakeEntities(faker.datatype.number());
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findManyEntites.mockResolvedValue(entities);

      const createPromise = entityManager.createEntities(entities);

      await expect(createPromise).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('rejects if fileId not exists', async () => {
      const entities = createFakeEntities(faker.datatype.number());

      findOneFile.mockResolvedValue(undefined);

      const createPromise = entityManager.createEntities(entities);

      await expect(createPromise).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('#updateEntity', () => {
    it('resolves without errors if entityId exists', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findOneEntity.mockResolvedValue(entity);
      updateEntity.mockResolvedValue(undefined);

      const createPromise = entityManager.updateEntity(entity.fileId, entity.entityId, entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if entityId not exists', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      findOneFile.mockResolvedValue(file);
      findOneEntity.mockResolvedValue(undefined);

      const createPromise = entityManager.updateEntity(entity.fileId, entity.entityId, entity);

      await expect(createPromise).rejects.toThrow(EntityNotFoundError);
    });

    it('rejects if fileId not exists', async () => {
      const entity = createFakeEntity();

      findOneFile.mockResolvedValue(undefined);
      findOneEntity.mockResolvedValue(entity);

      const createPromise = entityManager.updateEntity(entity.fileId, entity.entityId, entity);

      await expect(createPromise).rejects.toThrow(FileNotFoundError);
    });
  });
});
