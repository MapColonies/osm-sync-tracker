import { DelayedError, Job, Worker } from 'bullmq';
import { Registry } from 'prom-client';
import { CHANGESETS_QUEUE_NAME, QUEUE_KEY_PREFIX } from '../../../../src/queueProvider/constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
import { transactionify, TransactionName, TransactionParams } from '../../../../src/common/db/transactions';
import { Status } from '../../../../src/common/enums';
import { TransactionFailureError } from '../../../../src/common/errors';
import { updateJobCounter, delayJob } from '../../../../src/queueProvider/helpers';
import { ChangesetsWorker } from '../../../../src/queueProvider/workers';
import {
  bullMqOtelFn,
  CHANGESETS_WORKER_OPTIONS_MOCK,
  childLoggerMock,
  configMock,
  entityRepositoryFn,
  entityRespositoryMock,
  filesQueueMock,
  filesQueueMockFn,
  loggerMock,
  queueProviderHelpersFn,
  redisMock,
  workerMock,
  workerMockFn,
} from '../../../mocks';

jest.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Worker: jest.fn().mockImplementation(() => workerMock),
}));

jest.mock('../../../../src/queueProvider/helpers', () => ({
  delayJob: jest.fn().mockImplementation(() => queueProviderHelpersFn.delayJobMock),
  updateJobCounter: jest.fn().mockImplementation(() => queueProviderHelpersFn.updateJobCounterMock),
}));

jest.mock('../../../../src/common/db/transactions', (): object => ({
  ...jest.requireActual('../../../../src/common/db/transactions'),
  transactionify: jest.fn().mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../../../src/queueProvider/telemetry', () => ({
  bullMqOtelFactory: jest.fn().mockImplementation(() => bullMqOtelFn.bullMqOtel),
}));

describe('changesetsWorker', () => {
  let worker: ChangesetsWorker;

  beforeEach(() => {
    worker = new ChangesetsWorker(loggerMock, new Registry(), redisMock, configMock, entityRespositoryMock, filesQueueMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#queueName', () => {
    it('should retrieve the queue name', function () {
      expect(worker.queueName).toBe(CHANGESETS_QUEUE_NAME);
    });
  });

  describe('#start', () => {
    it('should create a changesets worker instance with correct arguments', async () => {
      await expect(worker.start()).resolves.not.toThrow();

      expect(Worker).toHaveBeenCalledTimes(1);
      expect(Worker).toHaveBeenCalledWith(CHANGESETS_QUEUE_NAME, expect.any(Function), {
        ...CHANGESETS_WORKER_OPTIONS_MOCK,
        prefix: QUEUE_KEY_PREFIX,
        connection: redisMock,
        autorun: false,
        telemetry: bullMqOtelFn.bullMqOtel,
      });
      expect(worker['worker']).toBeDefined();
      expect(workerMockFn.workerRunMock).toHaveBeenCalledTimes(1);
    });

    it('should cache reuslted worker on the first start and not fail', async function () {
      await expect(worker.start()).resolves.not.toThrow();
      await expect(worker.start()).resolves.not.toThrow();
      await expect(worker.start()).resolves.not.toThrow();

      expect(Worker).toHaveBeenCalledTimes(1);
      expect(Worker).toHaveBeenCalledWith(CHANGESETS_QUEUE_NAME, expect.any(Function), {
        ...CHANGESETS_WORKER_OPTIONS_MOCK,
        connection: redisMock,
        prefix: QUEUE_KEY_PREFIX,
        autorun: false,
        telemetry: bullMqOtelFn.bullMqOtel,
      });
      expect(worker).toBeDefined();
      expect(workerMockFn.workerRunMock).toHaveBeenCalledTimes(3);
    });

    it('should reject with error if worker run fails', async function () {
      const error = new Error('worker run error');
      workerMockFn.workerRunMock.mockRejectedValueOnce(error);

      await expect(worker.start()).rejects.toThrow(error);
    });
  });

  describe('#close', () => {
    it('should close an already started worker', async function () {
      await expect(worker.start()).resolves.not.toThrow();
      await expect(worker.close()).resolves.not.toThrow();

      expect(workerMockFn.workerCloseMock).toHaveBeenCalledTimes(1);
    });

    it('should close an already started worker only once', async function () {
      await expect(worker.start()).resolves.not.toThrow();

      await expect(worker.close()).resolves.not.toThrow();
      await expect(worker.close()).resolves.not.toThrow();
      await expect(worker.close()).resolves.not.toThrow();

      expect(workerMockFn.workerCloseMock).toHaveBeenCalledTimes(1);
    });

    it('should reject with an error if worker close fails', async function () {
      const error = new Error('close failed');
      workerMockFn.workerCloseMock.mockRejectedValueOnce(error);

      await expect(worker.start()).resolves.not.toThrow();
      await expect(worker.close()).rejects.toThrow(error);

      expect(workerMockFn.workerCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('processJobWrapper', () => {
    it('should process a single changeset closure job with no affected result', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      entityRepositoryFn.findFilesByChangesetsMock.mockResolvedValue([]);
      const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({ invokedJobCount: 0, invokedJobs: [] });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
        expect.anything(),
        childLoggerMock
      );
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
      expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
    });

    it('should process a single changeset closure job with affected results', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      entityRepositoryFn.findFilesByChangesetsMock.mockResolvedValue([{ fileId: 'fileId1' }, { fileId: 'fileId2' }]);
      const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({
        invokedJobCount: 2,
        invokedJobs: [
          { id: 'fileId1', kind: 'file' },
          { id: 'fileId2', kind: 'file' },
        ],
      });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
        expect.anything(),
        childLoggerMock
      );
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
      expect(filesQueueMockFn.pushMock).toHaveBeenCalledTimes(1);
      expect(filesQueueMockFn.pushMock).toHaveBeenCalledWith([
        { id: 'fileId1', kind: 'file' },
        { id: 'fileId2', kind: 'file' },
      ]);
    });

    it('should process a batch of changesets closure job with no affected result', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      entityRepositoryFn.findFilesByChangesetsMock.mockResolvedValue([]);
      const job = {
        data: { id: 'hashedChangesetsId', batchIds: ['changesetId1', 'changesetId2', 'changesetId3'], kind: 'changeset' },
        attemptsMade: 0,
        opts: { attempts: 10 },
      } as Job<BatchClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({ invokedJobCount: 0, invokedJobs: [] });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
        expect.anything(),
        childLoggerMock
      );
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(
        ['changesetId1', 'changesetId2', 'changesetId3'],
        [Status.IN_PROGRESS]
      );
      expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
    });

    it('should process a single changeset closure job if batch is invalid', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      entityRepositoryFn.findFilesByChangesetsMock.mockResolvedValue([]);
      const job = {
        data: { id: 'hashedChangesetsId', batchIds: ['changesetId1', 'changesetId2', 3], kind: 'changeset' },
        attemptsMade: 0,
        opts: { attempts: 10 },
      } as Job<BatchClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({ invokedJobCount: 0, invokedJobs: [] });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
        expect.anything(),
        childLoggerMock
      );
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['hashedChangesetsId'], [Status.IN_PROGRESS]);
      expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
    });

    it('should reject if an unknown error occurs', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      const someError = new Error('some error');
      entityRepositoryFn.findFilesByChangesetsMock.mockRejectedValue(someError);
      const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).rejects.toThrow(someError);

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
        expect.anything(),
        childLoggerMock
      );
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
      expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
      expect(updateJobCounter).not.toHaveBeenCalled();
      expect(delayJob).not.toHaveBeenCalled();
    });

    it('should reject if a transaction failure error occurs and delays the job', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      const transactionError = new TransactionFailureError('error');
      entityRepositoryFn.findFilesByChangesetsMock.mockRejectedValue(transactionError);
      const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).rejects.toThrow(DelayedError);

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
        expect.anything(),
        childLoggerMock
      );
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
      expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
      expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
      expect(updateJobCounter).toHaveBeenCalledTimes(1);
      expect(updateJobCounter).toHaveBeenCalledWith(job, 'transactionFailure');
      expect(delayJob).toHaveBeenCalledTimes(1);
      expect(delayJob).toHaveBeenCalledWith(job, expect.any(Number));
    });
  });
});
