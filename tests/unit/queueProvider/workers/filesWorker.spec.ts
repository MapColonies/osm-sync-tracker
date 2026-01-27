import { DelayedError, Job, Worker } from 'bullmq';
import { Registry } from 'prom-client';
import { FILES_QUEUE_NAME } from '../../../../src/queueProvider/constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
import { transactionify, TransactionName, TransactionParams } from '../../../../src/common/db/transactions';
import { TransactionFailureError } from '../../../../src/common/errors';
import { updateJobCounter, delayJob } from '../../../../src/queueProvider/helpers';
import {
  bullMqOtelFn,
  childLoggerMock,
  CLOSURE_KEY_PREFIX_MOCK,
  configMock,
  fileRepositoryMock,
  fileRepositoryMockFn,
  FILES_WORKER_OPTIONS_MOCK,
  loggerMock,
  queueProviderHelpersFn,
  redisMock,
  syncsQueueMock,
  workerMock,
  workerMockFn,
} from '../../../mocks';
import { FilesWorker } from '../../../../src/queueProvider/workers';

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

describe('filesWorker', () => {
  let worker: FilesWorker;

  beforeEach(() => {
    worker = new FilesWorker(loggerMock, new Registry(), redisMock, configMock, fileRepositoryMock, syncsQueueMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#queueName', () => {
    it('should retrieve the queue name', function () {
      expect(worker.queueName).toBe(FILES_QUEUE_NAME);
    });
  });

  describe('#start', () => {
    it('should create a changesets worker instance with correct arguments', async () => {
      await expect(worker.start()).resolves.not.toThrow();

      expect(Worker).toHaveBeenCalledTimes(1);
      expect(Worker).toHaveBeenCalledWith(FILES_QUEUE_NAME, expect.any(Function), {
        ...FILES_WORKER_OPTIONS_MOCK,
        prefix: CLOSURE_KEY_PREFIX_MOCK,
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
      expect(Worker).toHaveBeenCalledWith(FILES_QUEUE_NAME, expect.any(Function), {
        ...FILES_WORKER_OPTIONS_MOCK,
        connection: redisMock,
        prefix: CLOSURE_KEY_PREFIX_MOCK,
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
    it('should process a single file closure job with no affected result', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      fileRepositoryMockFn.attemptFileClosureMock.mockResolvedValue([[], 0]);
      const job = { data: { id: 'fileId', kind: 'file' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({ closedCount: 0, invokedJobCount: 0, invokedJobs: [] });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_FILE_CLOSURE, isolationLevel: 'b' }),
        expect.anything(),
        childLoggerMock
      );
      expect(fileRepositoryMockFn.attemptFileClosureMock).toHaveBeenCalledTimes(1);
      expect(fileRepositoryMockFn.attemptFileClosureMock).toHaveBeenCalledWith('fileId');
      expect(syncsQueueMock.push).not.toHaveBeenCalled();
    });

    it('should process a single file closure job with affected results', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      fileRepositoryMockFn.attemptFileClosureMock.mockResolvedValue([[{ fileId: 'fileId', syncId: 'syncId' }], 1]);
      const job = { data: { id: 'fileId', kind: 'file' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).resolves.toMatchObject({
        closedCount: 1,
        invokedJobCount: 1,
        invokedJobs: [{ id: 'syncId', kind: 'sync' }],
      });

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_FILE_CLOSURE, isolationLevel: 'b' }),
        expect.anything(),
        childLoggerMock
      );
      expect(fileRepositoryMockFn.attemptFileClosureMock).toHaveBeenCalledTimes(1);
      expect(fileRepositoryMockFn.attemptFileClosureMock).toHaveBeenCalledWith('fileId');
      expect(syncsQueueMock.push).toHaveBeenCalledTimes(1);
      expect(syncsQueueMock.push).toHaveBeenCalledWith([{ id: 'syncId', kind: 'sync' }]);
    });

    it('should reject if an unknown error occurs', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      const someError = new Error('some error');
      fileRepositoryMockFn.attemptFileClosureMock.mockRejectedValue(someError);
      const job = { data: { id: 'fileId', kind: 'file' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).rejects.toThrow(someError);

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_FILE_CLOSURE, isolationLevel: 'b' }),
        expect.anything(),
        childLoggerMock
      );
      expect(fileRepositoryMockFn.attemptFileClosureMock).toHaveBeenCalledTimes(1);
      expect(fileRepositoryMockFn.attemptFileClosureMock).toHaveBeenCalledWith('fileId');
      expect(syncsQueueMock.push).not.toHaveBeenCalled();
      expect(updateJobCounter).not.toHaveBeenCalled();
      expect(delayJob).not.toHaveBeenCalled();
    });

    it('should reject if a transaction failure error occurs and delays the job', async () => {
      await expect(worker.start()).resolves.not.toThrow();
      const processJobWrapper = worker['processJobWrapper'].bind(worker);
      const transactionError = new TransactionFailureError('error');
      fileRepositoryMockFn.attemptFileClosureMock.mockRejectedValue(transactionError);
      const job = { data: { id: 'fileId', kind: 'file' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

      await expect(processJobWrapper(job)).rejects.toThrow(DelayedError);

      expect(transactionify).toHaveBeenCalledTimes(1);
      expect(transactionify).toHaveBeenCalledWith(
        expect.objectContaining({ transactionName: TransactionName.ATTEMPT_FILE_CLOSURE, isolationLevel: 'b' }),
        expect.anything(),
        childLoggerMock
      );
      expect(fileRepositoryMockFn.attemptFileClosureMock).toHaveBeenCalledTimes(1);
      expect(fileRepositoryMockFn.attemptFileClosureMock).toHaveBeenCalledWith('fileId');
      expect(syncsQueueMock.push).not.toHaveBeenCalled();
      expect(updateJobCounter).toHaveBeenCalledTimes(1);
      expect(updateJobCounter).toHaveBeenCalledWith(job, 'transactionFailure');
      expect(delayJob).toHaveBeenCalledTimes(1);
      expect(delayJob).toHaveBeenCalledWith(job, expect.any(Number));
    });
  });
});
