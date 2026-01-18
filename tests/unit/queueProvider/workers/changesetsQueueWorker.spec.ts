import { DelayedError, Job, Worker } from 'bullmq';
import jsLogger, { Logger } from '@map-colonies/js-logger';
import ioRedis from 'ioredis';
import { Registry } from 'prom-client';
import { CHANGESETS_QUEUE_NAME, QUEUE_KEY_PREFIX, WorkerEnum } from '../../../../src/queueProvider/constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
import { transactionify, TransactionName, TransactionParams } from '../../../../src/common/db/transactions';
import { Status } from '../../../../src/common/enums';
import { TransactionFailureError } from '../../../../src/common/errors';
import { updateJobCounter, delayJob } from '../../../../src/queueProvider/helpers';
import { ChangesetsWorker } from '../../../../src/queueProvider/workers';
import { BullQueueProvider } from '../../../../src/queueProvider/queues/bullQueueProvider';
import { ConfigType } from '../../../../src/common/config';
import { EntityRepository } from '../../../../src/entity/DAL/entityRepository';

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

const changestsWorkerOptionsMock = { a: 1, transactionIsolationLevel: 'a', transactionFailureDelay: { minimum: 10, maximum: 15 } };

const configMock = {
  get: jest.fn((key) => {
    if (key === `closure.queues.${CHANGESETS_QUEUE_NAME}.workerOptions`) {
      return changestsWorkerOptionsMock;
    }
  }),
} as unknown as ConfigType;

const childLogger = {
  ...jsLogger({ enabled: false }),
};

const loggerMock = {
  child: jest.fn(() => childLogger),
} as unknown as Logger;

const redisMock = jest.fn() as unknown as ioRedis;

const entityRepositoryFn = {
  transactionifyMock: jest.fn().mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn()),
  findFilesByChangesetsMock: jest.fn(),
};
const entityRespositoryMock = {
  transactionify: entityRepositoryFn.transactionifyMock,
  findFilesByChangesets: entityRepositoryFn.findFilesByChangesetsMock,
} as unknown as EntityRepository;

const filesQueueMockFn = {
  pushMock: jest.fn(),
};

const filesQueueMock = {
  push: filesQueueMockFn.pushMock,
} as unknown as BullQueueProvider;

describe('changesetsWorker', () => {
  let changesetsWorker: ChangesetsWorker;

  beforeEach(() => {
    changesetsWorker = new ChangesetsWorker(loggerMock, new Registry(), redisMock, configMock, entityRespositoryMock, filesQueueMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create a changesets worker instance with correct arguments', () => {
    expect(Worker).toHaveBeenCalledTimes(1);
    expect(Worker).toHaveBeenCalledWith(CHANGESETS_QUEUE_NAME, expect.any(Function), {
      ...changestsWorkerOptionsMock,
      name: WorkerEnum.CHANGESETS,
      prefix: QUEUE_KEY_PREFIX,
      connection: redisMock,
      autorun: false,
    });
    expect(changesetsWorker['worker']).toBeDefined();
  });

  it('should process a single changeset closure job with no affected result', async () => {
    const processFn = changesetsWorker['processJobWrapper'];
    entityRepositoryFn.findFilesByChangesetsMock.mockResolvedValue([]);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

    await expect(processFn(job)).resolves.toMatchObject({ invokedJobCount: 0, invokedJobs: [] });

    expect(transactionify).toHaveBeenCalledTimes(1);
    expect(transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
      expect.anything(),
      childLogger
    );
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
    expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
  });

  it('should process a single changeset closure job with affected results', async () => {
    const processFn = changesetsWorker['processJobWrapper'];
    entityRepositoryFn.findFilesByChangesetsMock.mockResolvedValue([{ fileId: 'fileId1' }, { fileId: 'fileId2' }]);
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
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
    expect(filesQueueMockFn.pushMock).toHaveBeenCalledTimes(1);
    expect(filesQueueMockFn.pushMock).toHaveBeenCalledWith([
      { id: 'fileId1', kind: 'file' },
      { id: 'fileId2', kind: 'file' },
    ]);
  });

  it('should process a batch of changesets closure job with no affected result', async () => {
    const processFn = changesetsWorker['processJobWrapper'];
    entityRepositoryFn.findFilesByChangesetsMock.mockResolvedValue([]);
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
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['changesetId1', 'changesetId2', 'changesetId3'], [Status.IN_PROGRESS]);
    expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
  });

  it('should process a single changeset closure job if batch is invalid', async () => {
    const processFn = changesetsWorker['processJobWrapper'];
    entityRepositoryFn.findFilesByChangesetsMock.mockResolvedValue([]);
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
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['hashedChangesetsId'], [Status.IN_PROGRESS]);
    expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
  });

  it('should reject if an unknown error occurs', async () => {
    const processFn = changesetsWorker['processJobWrapper'];
    const someError = new Error('some error');
    entityRepositoryFn.findFilesByChangesetsMock.mockRejectedValue(someError);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    await expect(processFn(job)).rejects.toThrow(someError);

    expect(transactionify).toHaveBeenCalledTimes(1);
    expect(transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
      expect.anything(),
      childLogger
    );
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledTimes(1);
    expect(entityRepositoryFn.findFilesByChangesetsMock).toHaveBeenCalledWith(['changesetId'], [Status.IN_PROGRESS]);
    expect(filesQueueMockFn.pushMock).not.toHaveBeenCalled();
    expect(updateJobCounter).not.toHaveBeenCalled();
    expect(delayJob).not.toHaveBeenCalled();
  });

  it('should reject if a transaction failure error occurs and delays the job', async () => {
    const processFn = changesetsWorker['processJobWrapper'];
    const transactionError = new TransactionFailureError('error');
    entityRepositoryFn.findFilesByChangesetsMock.mockRejectedValue(transactionError);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    await expect(processFn(job)).rejects.toThrow(DelayedError);

    expect(transactionify).toHaveBeenCalledTimes(1);
    expect(transactionify).toHaveBeenCalledWith(
      expect.objectContaining({ transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: 'a' }),
      expect.anything(),
      childLogger
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
