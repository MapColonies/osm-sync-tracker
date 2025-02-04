import jsLogger from '@map-colonies/js-logger';
import { ChangesetManager } from '../../../../src/changeset/models/changesetManager';
import { ChangesetRepository } from '../../../../src/changeset/DAL/changesetRepository';
import { createFakeChangeset } from '../../../helpers/helper';
import { ChangesetAlreadyExistsError, ChangesetNotFoundError } from '../../../../src/changeset/models/errors';
import { JobQueueProvider } from '../../../../src/queueProvider/interfaces';
import { ClosureJob } from '../../../../src/queueProvider/types';

let changesetManager: ChangesetManager;
let queue: JobQueueProvider<ClosureJob>;

describe('ChangesetManager', () => {
  const createChangeset = jest.fn();
  const updateChangeset = jest.fn();
  const updateEntitiesOfChangesetAsCompleted = jest.fn();
  const findOneChangeset = jest.fn();

  const pushMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    const repository = {
      createChangeset,
      updateChangeset,
      findOneChangeset,
      updateEntitiesOfChangesetAsCompleted,
    } as unknown as ChangesetRepository;

    queue = {
      push: pushMock,
    } as unknown as JobQueueProvider<ClosureJob>;

    changesetManager = new ChangesetManager(repository as unknown as ChangesetRepository, jsLogger({ enabled: false }), queue);
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

  describe('#updateEntitiesOfChangesetAsCompleted', () => {
    it('resolves without errors if changeset exists in the db', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(entity);
      updateEntitiesOfChangesetAsCompleted.mockResolvedValue(undefined);

      const updatePromise = changesetManager.updateChangesetEntities(entity.changesetId);

      await expect(updatePromise).resolves.not.toThrow();
    });

    it('rejects if changeset is not exists in the db', async () => {
      const entity = createFakeChangeset();

      findOneChangeset.mockResolvedValue(undefined);

      const updatePromise = changesetManager.updateChangesetEntities(entity.changesetId);

      await expect(updatePromise).rejects.toThrow(ChangesetNotFoundError);
    });

    describe('#createClosures', () => {
      it('resolves without errors and push changesets to the queue', async () => {
        pushMock.mockResolvedValueOnce(undefined);
        const closurePromise = changesetManager.createClosures(['1', '2', '2', '3']);

        await expect(closurePromise).resolves.not.toThrow();

        expect(pushMock).toHaveBeenCalledTimes(1);
        expect(pushMock).toHaveBeenCalledWith([
          { id: '1', kind: 'changeset' },
          { id: '2', kind: 'changeset' },
          { id: '3', kind: 'changeset' },
        ]);
      });

      it('rejects if queue push has failed', async () => {
        const queueError = new Error('queue error');
        pushMock.mockRejectedValueOnce(queueError);

        const closurePromise = changesetManager.createClosures(['1']);

        await expect(closurePromise).rejects.toThrow(queueError);
        expect(pushMock).toHaveBeenCalledWith([{ id: '1', kind: 'changeset' }]);
      });
    });
  });
});
