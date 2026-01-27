import { JobType } from 'bullmq';
import { QueueName } from '../common/interfaces';

export const CHANGESETS_QUEUE_NAME: QueueName = 'changesets';
export const FILES_QUEUE_NAME: QueueName = 'files';
export const SYNCS_QUEUE_NAME: QueueName = 'syncs';

export const REDIS_CONNECTION_OPTIONS_SYMBOL = Symbol('RedisConntionOptions');

export const QUEUE_PROVIDER_FACTORY = Symbol('QueueProviderFactory');

export const CONSTANT_BULLMQ_WORKER_CONNECTION_OPTIONS = {
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
};

export const CONSTANT_BULLMQ_QUEUE_CONNECTION_OPTIONS = {
  enableOfflineQueue: false,
};

export const CLOSURE_WORKERS_INITIALIZER = Symbol('ClosureWorkersInitializer');

export const JOB_STATES: JobType[] = ['active', 'completed', 'delayed', 'failed', 'paused', 'wait', 'waiting', 'waiting-children'];

export enum WorkerEnum {
  CHANGESETS = 'changesets-worker',
  FILES = 'files-worker',
  SYNCS = 'syncs-worker',
}
