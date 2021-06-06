import jsLogger from '@map-colonies/js-logger';
import { ChangesetManager } from '../../../../src/changeset/models/changesetManager';
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
    it('resolves without errors if changesetId is not already in use by the db', async () => {
      const changeset = createFakeChangeset();

      findOneChangeset.mockResolvedValue(undefined);
      createChangeset.mockResolvedValue(undefined);

      const createPromise = changesetManager.createChangeset(changeset);

      await expect(createPromise).resolves.not.toThrow();
    });

    it('rejects if changesetId already in use by the db', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);

      const createPromise = changesetManager.createChangeset(entity);

      await expect(createPromise).rejects.toThrow(ChangesetAlreadyExistsError);
    });
  });

  describe('#updateChangeset', () => {
    it('resolves without errors if changeset exists in the db', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      updateChangeset.mockResolvedValue(undefined);

      const updatePromise = changesetManager.updateChangeset(entity.changesetId, entity);

      await expect(updatePromise).resolves.not.toThrow();
    });

    it('rejects if changeset is not exists in the db', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(undefined);

      const updatePromise = changesetManager.updateChangeset(entity.changesetId, entity);

      await expect(updatePromise).rejects.toThrow(ChangesetNotFoundError);
    });
  });

  describe('#closeChangeset', () => {
    it('resolves without errors if the changeset exists in the db', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      closeChangeset.mockResolvedValue(undefined);

      const closePromise = changesetManager.closeChangeset(entity.changesetId, 'public');

      await expect(closePromise).resolves.not.toThrow();
    });

    it('rejects if the changeset is not exists the db', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(undefined);

      const closePromise = changesetManager.closeChangeset(entity.changesetId, 'public');

      await expect(closePromise).rejects.toThrow(ChangesetNotFoundError);
    });
  });
});
