import jsLogger from '@map-colonies/js-logger';
import config from 'config';
import faker from 'faker';
import { QueryFailedError } from 'typeorm';
import { ChangesetManager } from '../../../../src/changeset/models/changesetManager';
import { createFakeChangeset } from '../../../helpers/helper';
import {
  ChangesetAlreadyExistsError,
  ChangesetNotFoundError,
  ExceededNumberOfRetriesError,
  TransactionFailureError,
} from '../../../../src/changeset/models/errors';

let changesetManager: ChangesetManager;
let changesetManagerWithRetries: ChangesetManager;

describe('ChangesetManager', () => {
  let createChangeset: jest.Mock;
  let updateChangeset: jest.Mock;
  let tryClosingChangeset: jest.Mock;
  let findOneChangeset: jest.Mock;

  beforeEach(() => {
    createChangeset = jest.fn();
    updateChangeset = jest.fn();
    tryClosingChangeset = jest.fn();
    findOneChangeset = jest.fn();

    const repository = { createChangeset, updateChangeset, tryClosingChangeset, findOneChangeset };
    changesetManager = new ChangesetManager(repository, jsLogger({ enabled: false }), config, { transactionRetryPolicy: { enabled: false } });
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
      tryClosingChangeset.mockResolvedValue(undefined);

      const closePromise = changesetManager.closeChangeset(entity.changesetId);

      await expect(closePromise).resolves.not.toThrow();
    });

    it('resolves if closing changeset fails only once while retries is configured', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      tryClosingChangeset.mockRejectedValueOnce(new TransactionFailureError('transaction failure'));

      const repository = { createChangeset, updateChangeset, tryClosingChangeset, findOneChangeset };
      changesetManagerWithRetries = new ChangesetManager(repository, jsLogger({ enabled: false }), config, {
        transactionRetryPolicy: { enabled: true, numRetries: 1 },
      });

      const closePromise = changesetManagerWithRetries.closeChangeset(entity.changesetId);

      await expect(closePromise).resolves.not.toThrow();
      expect(tryClosingChangeset).toHaveBeenCalledTimes(2);
    });

    it('rejects with transaction failure error if closing changeset fails', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      tryClosingChangeset.mockRejectedValue(new TransactionFailureError('transaction failure'));

      const closePromise = changesetManager.closeChangeset(entity.changesetId);

      await expect(closePromise).rejects.toThrow(TransactionFailureError);
    });

    it('rejects with exceeded number of retries error if closing changeset fails when retries if configured', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      tryClosingChangeset.mockRejectedValue(new TransactionFailureError('transaction failure'));

      const retries = faker.datatype.number({ min: 1, max: 10 });
      const repository = { createChangeset, updateChangeset, tryClosingChangeset, findOneChangeset };
      changesetManagerWithRetries = new ChangesetManager(repository, jsLogger({ enabled: false }), config, {
        transactionRetryPolicy: { enabled: true, numRetries: retries },
      });

      const closePromise = changesetManagerWithRetries.closeChangeset(entity.changesetId);

      await expect(closePromise).rejects.toThrow(ExceededNumberOfRetriesError);
      expect(tryClosingChangeset).toHaveBeenCalledTimes(retries + 1);
    });

    it('rejects without transaction failure error when retries is configured due to another error raising', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      tryClosingChangeset.mockRejectedValue(new QueryFailedError('some query', undefined, new Error()));

      const retries = faker.datatype.number({ min: 1, max: 10 });
      const repository = { createChangeset, updateChangeset, tryClosingChangeset, findOneChangeset };
      changesetManagerWithRetries = new ChangesetManager(repository, jsLogger({ enabled: false }), config, {
        transactionRetryPolicy: { enabled: true, numRetries: retries },
      });

      const closePromise = changesetManagerWithRetries.closeChangeset(entity.changesetId);

      await expect(closePromise).rejects.toThrow(QueryFailedError);
      expect(tryClosingChangeset).toHaveBeenCalledTimes(1);
    });

    it('rejects if the changeset is not exists the db', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(undefined);

      const closePromise = changesetManager.closeChangeset(entity.changesetId);

      await expect(closePromise).rejects.toThrow(ChangesetNotFoundError);
    });
  });
});
