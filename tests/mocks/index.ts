import ioRedis from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import jsLogger, { Logger } from '@map-colonies/js-logger';
import { TransactionParams } from '../../src/common/db/transactions';
import { EntityRepository } from '../../src/entity/DAL/entityRepository';
import { BullQueueProvider } from '../../src/queueProvider/queues/bullQueueProvider';
import { ConfigType } from '../../src/common/config';
import { CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, SYNCS_QUEUE_NAME } from '../../src/queueProvider/constants';
import { JobQueueProvider } from '../../src/queueProvider/interfaces';
import { ClosureJob } from '../../src/queueProvider/types';
import { FileRepository } from '../../src/file/DAL/fileRepository';
import { SyncRepository } from '../../src/sync/DAL/syncRepository';

export const CHANGESETS_WORKER_OPTIONS_MOCK = { a: 1, transactionIsolationLevel: 'a', transactionFailureDelay: { minimum: 10, maximum: 15 } };
export const FILES_WORKER_OPTIONS_MOCK = { b: 2, transactionIsolationLevel: 'b', transactionFailureDelay: { minimum: 20, maximum: 20 } };
export const SYNCS_WORKER_OPTIONS_MOCK = { c: 3, transactionIsolationLevel: 'c', transactionFailureDelay: { minimum: 30, maximum: 30 } };

export const configMock = {
  get: jest.fn((key) => {
    if (key === `closure.queues.${CHANGESETS_QUEUE_NAME}.workerOptions`) {
      return CHANGESETS_WORKER_OPTIONS_MOCK;
    }
    if (key === `closure.queues.${FILES_QUEUE_NAME}.workerOptions`) {
      return FILES_WORKER_OPTIONS_MOCK;
    }
    if (key === `closure.queues.${SYNCS_QUEUE_NAME}.workerOptions`) {
      return SYNCS_WORKER_OPTIONS_MOCK;
    }
  }),
} as unknown as ConfigType;

export const workerMockFn = {
  workerOnMock: jest.fn(),
  workerCloseMock: jest.fn(),
  workerRunMock: jest.fn(),
};

export const workerMock = {
  on: workerMockFn.workerOnMock,
  close: workerMockFn.workerCloseMock,
  run: workerMockFn.workerRunMock,
} as unknown as Worker;

export const bullMqOtelFn = {
  bullMqOtel: jest.fn(),
};

export const childLoggerMock = {
  ...jsLogger({ enabled: false }),
};

export const loggerMock = {
  child: jest.fn(() => childLoggerMock),
} as unknown as Logger;

export const queueProviderHelpersFn = {
  delayJobMock: jest.fn(),
  updateJobCounterMock: jest.fn(),
};

export const redisMock = jest.fn() as unknown as ioRedis;

export const entityRepositoryFn = {
  transactionifyMock: jest.fn().mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn()),
  findFilesByChangesetsMock: jest.fn(),
};

export const entityRespositoryMock = {
  transactionify: entityRepositoryFn.transactionifyMock,
  findFilesByChangesets: entityRepositoryFn.findFilesByChangesetsMock,
} as unknown as EntityRepository;

export const filesQueueMockFn = {
  pushMock: jest.fn(),
};

export const filesQueueMock = {
  push: filesQueueMockFn.pushMock,
} as unknown as BullQueueProvider;

export const fileRepositoryMockFn = {
  attemptFileClosureMock: jest.fn(),
};

export const fileRepositoryMock = {
  attemptFileClosure: fileRepositoryMockFn.attemptFileClosureMock,
} as unknown as FileRepository;

export const syncsQueueMockFn = {
  pushMock: jest.fn(),
};

export const syncsQueueMock = {
  push: syncsQueueMockFn.pushMock,
} as unknown as JobQueueProvider<ClosureJob>;

export const syncRepositoryMockFn = {
  attemptSyncClosureMock: jest.fn(),
};

export const syncRepositoryMock = {
  attemptSyncClosure: syncRepositoryMockFn.attemptSyncClosureMock,
} as unknown as SyncRepository;

export const queueMockFn = {
  closeMock: jest.fn(),
  addMock: jest.fn(),
  addBulkMock: jest.fn(),
  getJobMock: jest.fn(),
};

export const queueMock = {
  close: queueMockFn.closeMock,
  add: queueMockFn.addMock,
  addBulk: queueMockFn.addBulkMock,
  getJob: queueMockFn.getJobMock,
} as unknown as Queue;

export const queueEventsMockFn = {
  onMock: jest.fn(),
};

export const queueEventsMock = {
  on: queueEventsMockFn.onMock,
} as unknown as QueueEvents;
