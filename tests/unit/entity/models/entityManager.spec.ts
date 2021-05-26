import jsLogger from '@map-colonies/js-logger';
import { EntityManager } from '../../../../src/entity/models/entityManager';
import { EntityRepository } from '../../../../src/entity/DAL/entityRepository';
import { createFakeEntity, createFakeFile } from '../../../helpers/helper';
import { EntityAlreadyExistsError } from '../../../../src/entity/models/errors';
import { Entity } from '../../../../src/entity/models/entity';
import { EntityNotFoundError } from '../../../../src/entity/models/errors';
import { FileRepository } from '../../../../src/file/DAL/fileRepository';
import { FileNotFoundError } from '../../../../src/file/models/errors';

let entityManager: EntityManager;

describe('EntityManager', () => {
  let createEntity: jest.Mock;
  let createEntities: jest.Mock;
  let updateEntity: jest.Mock;
  let createFile: jest.Mock;
  let createFiles: jest.Mock;
  let findOne: jest.Mock;

  beforeEach(() => {
    createEntity = jest.fn();
    createEntities = jest.fn();
    updateEntity = jest.fn();

    createFile = jest.fn();
    createFiles = jest.fn();
    findOne = jest.fn();

    const repository = { createEntity, createEntities, updateEntity };
    const fileRepository = { createFile, createFiles, findOne };

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
      findOne.mockResolvedValue(file);

      const createPromise = entityManager.createEntity(entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if entityId already exists', async () => {
      const entity = createFakeEntity();
      const file = createFakeFile();

      findOne.mockResolvedValue(file);
      createEntity.mockRejectedValue(new EntityAlreadyExistsError(`entity = ${entity.entityId} already exists`));

      const createPromise = entityManager.createEntity(entity);

      await expect(createPromise).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('rejects if fileId not exists', async () => {
      const entity = createFakeEntity();
      findOne.mockResolvedValue(undefined);

      const createPromise = entityManager.createEntity(entity);

      await expect(createPromise).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('#createEntities', () => {
    it("resolves without errors if entityId's are not used", async () => {
      createEntities.mockResolvedValue(undefined);
      const entities: Entity[] = [];
      const file = createFakeFile();

      findOne.mockResolvedValue(file);

      entities.push(createFakeEntity());
      entities.push(createFakeEntity());
      entities.push(createFakeEntity());

      const createPromise = entityManager.createEntities(entities);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if entityId not exists', async () => {
      const entities: Entity[] = [];
      const file = createFakeFile();

      findOne.mockResolvedValue(file);

      entities.push(createFakeEntity());
      entities.push(createFakeEntity());
      entities.push(createFakeEntity());

      createEntities.mockRejectedValue(
        new EntityAlreadyExistsError(`entities = [${entities.map((entity) => entity.entityId).toString()}] already exists`)
      );

      const createPromise = entityManager.createEntities(entities);

      await expect(createPromise).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('rejects if fileId not exists', async () => {
      const entities: Entity[] = [];

      findOne.mockResolvedValue(undefined);

      entities.push(createFakeEntity());
      entities.push(createFakeEntity());
      entities.push(createFakeEntity());

      const createPromise = entityManager.createEntities(entities);

      await expect(createPromise).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('#updateEntity', () => {
    it('resolves without errors if entityId exists', async () => {
      updateEntity.mockResolvedValue(undefined);
      const entity = createFakeEntity();

      const createPromise = entityManager.updateEntity(entity.entityId, entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if entityId not exists', async () => {
      const entity = createFakeEntity();
      updateEntity.mockRejectedValue(new EntityNotFoundError(`entity = ${entity.entityId} not found`));

      const createPromise = entityManager.updateEntity(entity.entityId, entity);

      await expect(createPromise).rejects.toThrow(EntityNotFoundError);
    });
  });
});
