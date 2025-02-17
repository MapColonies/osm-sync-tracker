import { Job, Worker } from 'bullmq';
import { DependencyContainer, FactoryFunction } from 'tsyringe';
import jsLogger from '@map-colonies/js-logger';
import { changesetsQueueWorkerFactory } from '../../../../src/queueProvider/workers/changesetsQueueWorker';
import { SERVICES } from '../../../../src/common/constants';
import {
  CHANGESETS_QUEUE_NAME,
  FILES_QUEUE_NAME,
  JOB_STALLED_FAILURE_ERROR_MESSAGE,
  SYNCS_QUEUE_NAME,
} from '../../../../src/queueProvider/constants';
import { BatchClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
import { ENTITY_CUSTOM_REPOSITORY_SYMBOL } from '../../../../src/entity/DAL/entityRepository';
import { filesQueueWorkerFactory } from '../../../../src/queueProvider/workers/filesQueueWorker';
import { syncsQueueWorkerFactory } from '../../../../src/queueProvider/workers/syncsQueueWorker';

describe('commonQueueWorkerFactory', () => {
  let factory: FactoryFunction<Worker>;
  let worker: Worker;

  const workerOptionsMock = { transactionIsolationLevel: 'a', transactionFailureDelay: 10 };

  const configMock = {
    get: jest.fn(() => {
      return workerOptionsMock;
    }),
  };

  const childLogger = {
    ...jsLogger({ enabled: false }),
  };

  const loggerMock = {
    child: jest.fn(() => childLogger),
  };

  const cleanupResgistryMock = {
    register: jest.fn(),
  };

  const redisMock = jest.fn();

  const entityRespositoryMock = {
    findFilesByChangesets: jest.fn(),
  };

  const changesetsQueueMock = {
    push: jest.fn(),
  };

  const filesQueueMock = {
    push: jest.fn(),
  };

  const syncsQueueMock = {
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
      if (token === SERVICES.CLEANUP_REGISTRY) {
        return cleanupResgistryMock;
      }
      if (token === SERVICES.REDIS) {
        return redisMock;
      }
      if (token === ENTITY_CUSTOM_REPOSITORY_SYMBOL) {
        return entityRespositoryMock;
      }
      if (token === CHANGESETS_QUEUE_NAME) {
        return changesetsQueueMock;
      }
      if (token === FILES_QUEUE_NAME) {
        return filesQueueMock;
      }
      if (token === SYNCS_QUEUE_NAME) {
        return syncsQueueMock;
      }
      return jest.fn();
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize changesets worker with listerner for the three events', async () => {
    factory = changesetsQueueWorkerFactory;

    worker = factory(containerMock as unknown as DependencyContainer);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    expect(worker.listenerCount('completed')).toBe(1);
    expect(worker.listenerCount('failed')).toBe(1);
    expect(worker.listenerCount('error')).toBe(1);

    worker.emit('completed', job, undefined, '');
    worker.emit('failed', job, new Error(), '');
    worker.emit('failed', job, new Error(JOB_STALLED_FAILURE_ERROR_MESSAGE), 'prev');
    worker.emit('error', new Error());

    expect(changesetsQueueMock.push).toHaveBeenCalledTimes(1);
    expect(changesetsQueueMock.push).toHaveBeenCalledWith([{ ...job.data, stalledFailureCount: 1 }]);
    await worker.close(true);
  });

  it('should initialize files worker with listerner for the three events', async () => {
    factory = filesQueueWorkerFactory;

    worker = factory(containerMock as unknown as DependencyContainer);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    expect(worker.listenerCount('completed')).toBe(1);
    expect(worker.listenerCount('failed')).toBe(1);
    expect(worker.listenerCount('error')).toBe(1);

    worker.emit('completed', job, undefined, '');
    worker.emit('failed', job, new Error(), '');
    worker.emit('failed', job, new Error(JOB_STALLED_FAILURE_ERROR_MESSAGE), 'prev');
    worker.emit('error', new Error());

    expect(filesQueueMock.push).toHaveBeenCalledTimes(1);
    expect(filesQueueMock.push).toHaveBeenCalledWith([{ ...job.data, stalledFailureCount: 1 }]);

    await worker.close(true);
  });

  it('should initialize syncs worker with listerner for the three events', async () => {
    factory = syncsQueueWorkerFactory;

    worker = factory(containerMock as unknown as DependencyContainer);
    const job = { data: { id: 'changesetId', kind: 'changeset' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

    expect(worker.listenerCount('completed')).toBe(1);
    expect(worker.listenerCount('failed')).toBe(1);
    expect(worker.listenerCount('error')).toBe(1);

    worker.emit('completed', job, undefined, '');
    worker.emit('failed', job, new Error(), '');
    worker.emit('failed', job, new Error(JOB_STALLED_FAILURE_ERROR_MESSAGE), 'prev');
    worker.emit('error', new Error());

    expect(syncsQueueMock.push).toHaveBeenCalledTimes(1);
    expect(syncsQueueMock.push).toHaveBeenCalledWith([{ ...job.data, stalledFailureCount: 1 }]);

    await worker.close(true);
  });
});
