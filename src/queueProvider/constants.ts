export const CHANGESETS_QUEUE_NAME = 'changesets';
export const FILES_QUEUE_NAME = 'files';
export const SYNCS_QUEUE_NAME = 'syncs';

export const REDIS_CONNECTION_OPTIONS_SYMBOL = Symbol('RedisConntionOptions');

export const QUEUE_PROVIDER_FACTORY = Symbol('QueueProviderFactory');

export const CONSTANT_BULLMQ_CONNECTION_OPTIONS = {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
};
