import { DelayedError, Job, Worker } from 'bullmq';
import { Registry } from 'prom-client';
import { QUEUE_KEY_PREFIX, SYNCS_QUEUE_NAME } from '../../../../src/queueProvider/constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
import { transactionify, TransactionName, TransactionParams } from '../../../../src/common/db/transactions';
import { TransactionFailureError } from '../../../../src/common/errors';
import { updateJobCounter, delayJob } from '../../../../src/queueProvider/helpers';
import {
  bullMqOtelFn,
  childLoggerMock,
  configMock,
  loggerMock,
  queueProviderHelpersFn,
  redisMock,
  syncRepositoryMock,
  syncRepositoryMockFn,
  SYNCS_WORKER_OPTIONS_MOCK,
  workerMock,
  workerMockFn,
} from '../../../mocks';
import { SyncsWorker } from '../../../../src/queueProvider/workers';

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

describe('syncsWorker', () => {
  let worker: SyncsWorker;

  beforeEach(() => {
    worker = new SyncsWorker(loggerMock, new Registry(), redisMock, configMock, syncRepositoryMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#queueName', () => {
    it('should retrieve the queue name', function () {
      expect(worker.queueName).toBe(SYNCS_QUEUE_NAME);
    });
  });

  describe('#start', () => {
    it('should create a changesets worker instance with correct arguments', async () => {
      await expect(worker.start()).resolves.not.toThrow();

      expect(Worker).toHaveBeenCalledTimes(1);
      expect(Worker).toHaveBeenCalledWith(SYNCS_QUEUE_NAME, expect.any(Function), {
        ...SYNCS_WORKER_OPTIONS_MOCK,
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
      expect(Worker).toHaveBeenCalledWith(SYNCS_QUEUE_NAME, expect.any(Function), {
        ...SYNCS_WORKER_OPTIONS_MOCK,
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
    it('should process a single sync closure job with no affected result', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      syncRepositoryMockFn.attemptSyncClosureMock.mockResolvedValue([[], 0]);
      const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
        expect.anything(),
        childLoggerMock
      );
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledTimes(1);
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledWith('syncId');
    });

    it('should process a single sync closure job with single affected results', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      syncRepositoryMockFn.attemptSyncClosureMock.mockResolvedValue([[{ id: 'syncId' }], 1]);
      const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({ closedCount: 1, closedIds: ['syncId'], invokedJobCount: 0, invokedJobs: [] });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
        expect.anything(),
        childLoggerMock
      );
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledTimes(1);
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledWith('syncId');
    });

    it('should process a single sync closure job with multiple affected results', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      syncRepositoryMockFn.attemptSyncClosureMock.mockResolvedValue([[{ id: 'syncId' }, { id: 'rerunId' }], 2]);
      const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({
        closedCount: 2,
        closedIds: ['syncId', 'rerunId'],
        invokedJobCount: 0,
        invokedJobs: [],
      });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
        expect.anything(),
        childLoggerMock
      );
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledTimes(1);
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledWith('syncId');
    });

    it('should reject if an unknown error occurs', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      const someError = new Error('some error');
      syncRepositoryMockFn.attemptSyncClosureMock.mockRejectedValue(someError);
      const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).rejects.toThrow(someError);

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
        expect.anything(),
        childLoggerMock
      );
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledTimes(1);
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledWith('syncId');
      expect(updateJobCounter).not.toHaveBeenCalled();
      expect(delayJob).not.toHaveBeenCalled();
    });

    it('should reject if a transaction failure error occurs and delays the job', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      const transactionError = new TransactionFailureError('error');
      syncRepositoryMockFn.attemptSyncClosureMock.mockRejectedValue(transactionError);
      const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).rejects.toThrow(DelayedError);

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
        expect.anything(),
        childLoggerMock
      );
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledTimes(1);
      expect(syncRepositoryMockFn.attemptSyncClosureMock).toHaveBeenCalledWith('syncId');
      expect(updateJobCounter).toHaveBeenCalledTimes(1);
      expect(updateJobCounter).toHaveBeenCalledWith(job, 'transactionFailure');
      expect(delayJob).toHaveBeenCalledTimes(1);
      expect(delayJob).toHaveBeenCalledWith(job, expect.any(Number));
    });
  });
});
