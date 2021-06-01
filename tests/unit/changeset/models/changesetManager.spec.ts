import jsLogger from '@map-colonies/js-logger';
import { ChangesetManager } from '../../../../src/changeset/models/changesetManager';
import { ChangesetRepository } from '../../../../src/changeset/DAL/changsetRepository';
import { createFakeChangeset } from '../../../helpers/helper';
import { ChangesetAlreadyExistsError, ChangesetNotFoundError } from '../../../../src/changeset/models/errors';

let changesetManager: ChangesetManager;

describe('ChangesetManager', () => {
  let createChangeset: jest.Mock;
  let updateChangeset: jest.Mock;
  let closeChangeset: jest.Mock;
  let findOneChangeset: jest.Mock;

  beforeEach(() => {
    createChangeset = jest.fn();
    updateChangeset = jest.fn();
    closeChangeset = jest.fn();
    findOneChangeset = jest.fn();

    const repository = { createChangeset, updateChangeset, closeChangeset, findOneChangeset };
    changesetManager = new ChangesetManager(repository, jsLogger({ enabled: false }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#createChangeset', () => {
    it('resolves without errors if changesetId are not used', async () => {
      const changeset = createFakeChangeset();

      findOneChangeset.mockResolvedValue(undefined);
      createChangeset.mockResolvedValue(undefined);

      const createPromise = changesetManager.createChangeset(changeset);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if changesetId already exists', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);

      const createPromise = changesetManager.createChangeset(entity);

      await expect(createPromise).rejects.toThrow(ChangesetAlreadyExistsError);
    });
  });

  describe('#updateChangeset', () => {
    it('resolves without errors if changesetId exists', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      updateChangeset.mockResolvedValue(undefined);

      const createPromise = changesetManager.updateChangeset(entity.changesetId, entity);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if changesetId not exists', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(undefined);

      const createPromise = changesetManager.updateChangeset(entity.changesetId, entity);

      await expect(createPromise).rejects.toThrow(ChangesetNotFoundError);
    });
  });

  describe('#closeChangeset', () => {
    it('resolves without errors if changesetId exists', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      closeChangeset.mockResolvedValue(undefined);

      const createPromise = changesetManager.closeChangeset(entity.changesetId);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if changesetId not exists', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(undefined);

      const createPromise = changesetManager.closeChangeset(entity.changesetId);

      await expect(createPromise).rejects.toThrow(ChangesetNotFoundError);
    });
  });
});
