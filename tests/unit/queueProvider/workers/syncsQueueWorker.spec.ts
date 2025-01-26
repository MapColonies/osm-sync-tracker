import { DelayedError, Job, Worker } from 'bullmq';
import { DependencyContainer, FactoryFunction } from 'tsyringe';
import jsLogger from '@map-colonies/js-logger';
import { SERVICES } from '../../../../src/common/constants';
import { KEY_PREFIX, SYNCS_QUEUE_NAME } from '../../../../src/queueProvider/constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
import { TransactionName, TransactionParams } from '../../../../src/common/db/transactions';
import { TransactionFailureError } from '../../../../src/common/errors';
import { updateJobCounter, delayJob } from '../../../../src/queueProvider/helpers';
import { SYNC_CUSTOM_REPOSITORY_SYMBOL } from '../../../../src/sync/DAL/syncRepository';
import { SYNCS_QUEUE_WORKER_NAME, syncsQueueWorkerFactory } from '../../../../src/queueProvider/workers/syncsQueueWorker';

type ProcessFn<T = ClosureJob, R = ClosureReturn> = (job: Job<T, R>) => R;

jest.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Worker: jest.fn().mockImplementation((_: string, processFn: ProcessFn) => ({
    processFn,
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('../../../../src/queueProvider/helpers', () => ({
  delayJob: jest.fn(),
  updateJobCounter: jest.fn(),
}));

describe('syncsQueueWorkerFactory', () => {
  let factory: FactoryFunction<Worker>;
  let worker: Worker;

  const syncsWorkerOptionsMock = { c: 3, transactionIsolationLevel: 'c', transactionFailureDelay: 30 };

  const configMock = {
    get: jest.fn((key) => {
      if (key === `closure.queues.${SYNCS_QUEUE_NAME}.workerOptions`) {
        return syncsWorkerOptionsMock;
      }
    }),
  };

  const childLogger = {
    ...jsLogger({ enabled: false }),
  };

  const loggerMock = {
    child: jest.fn(() => childLogger),
  };

  const redisMock = jest.fn();

  const syncRespositoryMock = {
    transactionify: jest.fn().mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn()),
    attemptSyncClosure: jest.fn(),
  };

  const containerMock = {
    resolve: jest.fn((token) => {
      if (token === SERVICES.LOGGER) {
        return loggerMock;
      }
      if (token === SERVICES.CONFIG) {
        return configMock;
      }
      if (token === SERVICES.REDIS) {
        return redisMock;
      }
      if (token === SYNC_CUSTOM_REPOSITORY_SYMBOL) {
        return syncRespositoryMock;
      }
      return jest.fn();
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    factory = syncsQueueWorkerFactory;
  });

  it('should create a syncs worker instance with correct arguments', () => {
    worker = factory(containerMock as unknown as DependencyContainer);

    expect(Worker).toHaveBeenCalledTimes(1);
    expect(Worker).toHaveBeenCalledWith(SYNCS_QUEUE_NAME, expect.any(Function), {
      ...syncsWorkerOptionsMock,
      name: SYNCS_QUEUE_WORKER_NAME,
      prefix: KEY_PREFIX,
      connection: redisMock,
      autorun: false,
    });
    expect(worker).toBeDefined();
  });

  it('should process a single sync closure job with no affected result', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    syncRespositoryMock.transactionify.mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn());
    syncRespositoryMock.attemptSyncClosure.mockResolvedValue([[], 0]);
    const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

    await expect(processFn(job)).resolves.toMatchObject({ closedCount: 0, closedIds: [], invokedJobCount: 0, invokedJobs: [] });

    expect(syncRespositoryMock.transactionify).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
      expect.anything()
    );
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledWith('syncId');
  });

  it('should process a single sync closure job with single affected results', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    syncRespositoryMock.transactionify.mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn());
    syncRespositoryMock.attemptSyncClosure.mockResolvedValue([[{ id: 'syncId' }], 1]);
    const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

    await expect(processFn(job)).resolves.toMatchObject({ closedCount: 1, closedIds: ['syncId'], invokedJobCount: 0, invokedJobs: [] });

    expect(syncRespositoryMock.transactionify).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
      expect.anything()
    );
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledWith('syncId');
  });

  it('should process a single sync closure job with multiple affected results', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    syncRespositoryMock.transactionify.mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn());
    syncRespositoryMock.attemptSyncClosure.mockResolvedValue([[{ id: 'syncId' }, { id: 'rerunId' }], 2]);
    const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

    await expect(processFn(job)).resolves.toMatchObject({ closedCount: 2, closedIds: ['syncId', 'rerunId'], invokedJobCount: 0, invokedJobs: [] });

    expect(syncRespositoryMock.transactionify).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
      expect.anything()
    );
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledWith('syncId');
  });

  it('should reject if an unknown error occurs', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    const someError = new Error('some error');
    syncRespositoryMock.attemptSyncClosure.mockRejectedValue(someError);
    const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    await expect(processFn(job)).rejects.toThrow(someError);

    expect(syncRespositoryMock.transactionify).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
      expect.anything()
    );
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledWith('syncId');
    expect(updateJobCounter).not.toHaveBeenCalled();
    expect(delayJob).not.toHaveBeenCalled();
  });

  it('should reject if a transaction failure error occurs and delays the job', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    const transactionError = new TransactionFailureError('error');
    syncRespositoryMock.attemptSyncClosure.mockRejectedValue(transactionError);
    const job = { data: { id: 'syncId', kind: 'sync' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    await expect(processFn(job)).rejects.toThrow(DelayedError);

    expect(syncRespositoryMock.transactionify).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: 'c' }),
      expect.anything()
    );
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledTimes(1);
    expect(syncRespositoryMock.attemptSyncClosure).toHaveBeenCalledWith('syncId');
    expect(updateJobCounter).toHaveBeenCalledTimes(1);
    expect(updateJobCounter).toHaveBeenCalledWith(job, 'transactionFailure');
    expect(delayJob).toHaveBeenCalledTimes(1);
    expect(delayJob).toHaveBeenCalledWith(job, 30);
  });
});
