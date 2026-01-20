import { Job } from 'bullmq';
import { Registry } from 'prom-client';
import { WorkerEnum } from '../../../../src/queueProvider/constants';
import { ClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
import { ChangesetsWorker, FilesWorker, SyncsWorker, workerIdToClass } from '../../../../src/queueProvider/workers';
import { configMock, entityRespositoryMock, filesQueueMock, loggerMock, redisMock } from '../../../mocks';

describe('commonBullWorkerProvider', () => {
  let worker: ChangesetsWorker;

  beforeEach(function () {
    worker = new ChangesetsWorker(loggerMock, new Registry(), redisMock, configMock, entityRespositoryMock, filesQueueMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#eventListeners', () => {
    it('should listen to each of the events once and execute on functions when emmited', function () {
      const mockJob = {
        data: { id: 'changesetId', kind: 'changeset' },
        attemptsMade: 0,
        opts: { attempts: 10 },
        processedOn: 1000,
        finishedOn: 2000,
      } as Job<ClosureJob, ClosureReturn>;
      const mockJobOnLastAttempt = { ...mockJob, attemptsMade: 10, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;
      let bullWorker = worker['worker'];
      const createWorkerFn = worker['createWorker'].bind(worker);
      expect(bullWorker).toBeUndefined();

      createWorkerFn();

      bullWorker = worker['worker'];
      expect(bullWorker).toBeDefined();
      expect(bullWorker?.listenerCount('completed')).toBe(1);
      expect(bullWorker?.listenerCount('failed')).toBe(1);
      expect(bullWorker?.listenerCount('stalled')).toBe(1);
      expect(bullWorker?.listenerCount('error')).toBe(1);

      bullWorker?.emit('completed', mockJob, { invokedJobCount: 0, invokedJobs: [] }, '');
      bullWorker?.emit('failed', mockJob, new Error('some error'), '');
      bullWorker?.emit('failed', mockJobOnLastAttempt, new Error('some error'), '');
      bullWorker?.emit('stalled', mockJob.data.id, '');
      bullWorker?.emit('error', new Error('some internal error'));
    });
  });

  describe('#workerIdToClass', () => {
    it('should match worker id to worker class', () => {
      expect(workerIdToClass(WorkerEnum.CHANGESETS)).toBe(ChangesetsWorker);
      expect(workerIdToClass(WorkerEnum.FILES)).toBe(FilesWorker);
      expect(workerIdToClass(WorkerEnum.SYNCS)).toBe(SyncsWorker);
    });
  });
});
