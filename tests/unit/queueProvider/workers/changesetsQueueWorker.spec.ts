import { DelayedError, Job, Worker } from 'bullmq';
import { DependencyContainer, FactoryFunction } from 'tsyringe';
import jsLogger from '@map-colonies/js-logger';
import { CHANGESETS_QUEUE_WORKER_NAME, changesetsQueueWorkerFactory } from '../../../../src/queueProvider/workers/changesetsQueueWorker';
import { SERVICES } from '../../../../src/common/constants';
import { CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, KEY_PREFIX } from '../../../../src/queueProvider/constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
import { ENTITY_CUSTOM_REPOSITORY_SYMBOL } from '../../../../src/entity/DAL/entityRepository';
import { transactionify, TransactionName, TransactionParams } from '../../../../src/common/db/transactions';
import { Status } from '../../../../src/common/enums';
import { TransactionFailureError } from '../../../../src/common/errors';
import { updateJobCounter, delayJob } from '../../../../src/queueProvider/helpers';

type ProcessFn<T = ClosureJob | BatchClosureJob, R = ClosureReturn> = (job: Job<T, R>) => R;

jest.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Worker: jest.fn().mockImplementation((_: string, processFn: ProcessFn) => {
    return {
      processFn,
      on: jest.fn(),
      close: jest.fn(),
    };
  }),
}));

jest.mock('../../../../src/queueProvider/helpers', () => ({
  delayJob: jest.fn(),
  updateJobCounter: jest.fn(),
}));

jest.mock('../../../../src/common/db/transactions', (): object => ({
  ...jest.requireActual('../../../../src/common/db/transactions'),
  transactionify: jest.fn().mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn()),
}));

describe('changesetsQueueWorkerFactory', () => {
  let factory: FactoryFunction<Worker>;
  let worker: Worker;

  const changestsWorkerOptionsMock = { a: 1, transactionIsolationLevel: 'a', transactionFailureDelay: { minimum: 10, maximum: 15 } };

  const configMock = {
    get: jest.fn((key) => {
      if (key === `closure.queues.${CHANGESETS_QUEUE_NAME}.workerOptions`) {
        return changestsWorkerOptionsMock;
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

  const entityRespositoryMock = {
    transactionify: jest.fn().mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn()),
    findFilesByChangesets: jest.fn(),
  };

  const filesQueueMock = {
    push: jest.fn(),
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
      if (token === ENTITY_CUSTOM_REPOSITORY_SYMBOL) {
        return entityRespositoryMock;
      }
      if (token === FILES_QUEUE_NAME) {
        return filesQueueMock;
      }
      return jest.fn();
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    factory = changesetsQueueWorkerFactory;
  });

  it('should create a changesets worker instance with correct arguments', () => {
    worker = factory(containerMock as unknown as DependencyContainer);

    expect(Worker).toHaveBeenCalledTimes(1);
    expect(Worker).toHaveBeenCalledWith(CHANGESETS_QUEUE_NAME, expect.any(Function), {
      ...changestsWorkerOptionsMock,
      name: CHANGESETS_QUEUE_WORKER_NAME,
      prefix: KEY_PREFIX,
      connection: redisMock,
      autorun: false,
    });
    expect(worker).toBeDefined();
  });

  it('should process a single changeset closure job with no affected result', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    entityRespositoryMock.findFilesByChangesets.mockResolvedValue([]);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

    await expect(processFn(job)).resolves.toMatchObject({ invokedJobCount: 0, invokedJobs: [] });

    expect(transactionify).toHaveBeenCalledTimes(1);
    expect(transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
      expect.anything(),
      childLogger
    );
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledTimes(1);
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
    expect(filesQueueMock.push).not.toHaveBeenCalled();
  });

  it('should process a single changeset closure job with affected results', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    entityRespositoryMock.findFilesByChangesets.mockResolvedValue([{ fileId: 'fileId1' }, { fileId: 'fileId2' }]);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

    await expect(processFn(job)).resolves.toMatchObject({
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
      childLogger
    );
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledTimes(1);
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
    expect(filesQueueMock.push).toHaveBeenCalledTimes(1);
    expect(filesQueueMock.push).toHaveBeenCalledWith([
      { id: 'fileId1', kind: 'file' },
      { id: 'fileId2', kind: 'file' },
    ]);
  });

  it('should process a batch of changesets closure job with no affected result', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    entityRespositoryMock.findFilesByChangesets.mockResolvedValue([]);
    const job = {
      data: { id: 'hashedChangesetsId', batchIds: ['changesetId1', 'changesetId2', 'changesetId3'], kind: 'changeset' },
      attemptsMade: 0,
      opts: { attempts: 10 },
    } as Job<BatchClosureJob, ClosureReturn>;

    await expect(processFn(job)).resolves.toMatchObject({ invokedJobCount: 0, invokedJobs: [] });

    expect(transactionify).toHaveBeenCalledTimes(1);
    expect(transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
      expect.anything(),
      childLogger
    );
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledTimes(1);
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledWith(['changesetId1', 'changesetId2', 'changesetId3'], [Status.IN_PROGRESS]);
    expect(filesQueueMock.push).not.toHaveBeenCalled();
  });

  it('should process a single changeset closure job if batch is invalid', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    entityRespositoryMock.findFilesByChangesets.mockResolvedValue([]);
    const job = {
      data: { id: 'hashedChangesetsId', batchIds: ['changesetId1', 'changesetId2', 3], kind: 'changeset' },
      attemptsMade: 0,
      opts: { attempts: 10 },
    } as Job<BatchClosureJob, ClosureReturn>;

    await expect(processFn(job)).resolves.toMatchObject({ invokedJobCount: 0, invokedJobs: [] });

    expect(transactionify).toHaveBeenCalledTimes(1);
    expect(transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
      expect.anything(),
      childLogger
    );
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledTimes(1);
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledWith(['hashedChangesetsId'], [Status.IN_PROGRESS]);
    expect(filesQueueMock.push).not.toHaveBeenCalled();
  });

  it('should reject if an unknown error occurs', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    const someError = new Error('some error');
    entityRespositoryMock.findFilesByChangesets.mockRejectedValue(someError);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    await expect(processFn(job)).rejects.toThrow(someError);

    expect(transactionify).toHaveBeenCalledTimes(1);
    expect(transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
      expect.anything(),
      childLogger
    );
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledTimes(1);
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
    expect(filesQueueMock.push).not.toHaveBeenCalled();
    expect(updateJobCounter).not.toHaveBeenCalled();
    expect(delayJob).not.toHaveBeenCalled();
  });

  it('should reject if a transaction failure error occurs and delays the job', async () => {
    worker = factory(containerMock as unknown as DependencyContainer);
    const processFn = worker['processFn'];
    const transactionError = new TransactionFailureError('error');
    entityRespositoryMock.findFilesByChangesets.mockRejectedValue(transactionError);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    await expect(processFn(job)).rejects.toThrow(DelayedError);

    expect(transactionify).toHaveBeenCalledTimes(1);
    expect(transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
      expect.anything(),
      childLogger
    );
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledTimes(1);
    expect(entityRespositoryMock.findFilesByChangesets).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
    expect(filesQueueMock.push).not.toHaveBeenCalled();
    expect(updateJobCounter).toHaveBeenCalledTimes(1);
    expect(updateJobCounter).toHaveBeenCalledWith(job, 'transactionFailure');
    expect(delayJob).toHaveBeenCalledTimes(1);
    expect(delayJob).toHaveBeenCalledWith(job, expect.any(Number));
  });
});
