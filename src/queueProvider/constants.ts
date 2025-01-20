import { QueueName } from '../common/interfaces';

export const KEY_PREFIX = '{closure}';

export const CHANGESETS_QUEUE_NAME: QueueName = 'changesets';
export const FILES_QUEUE_NAME: QueueName = 'files';
export const SYNCS_QUEUE_NAME: QueueName = 'syncs';

export const REDIS_CONNECTION_OPTIONS_SYMBOL = Symbol('RedisConntionOptions');

export const QUEUE_PROVIDER_FACTORY = Symbol('QueueProviderFactory');

export const CONSTANT_BULLMQ_CONNECTION_OPTIONS = {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
};

export const CLOSURE_WORKERS_INITIALIZER = Symbol('ClosureWorkersInitializer');
