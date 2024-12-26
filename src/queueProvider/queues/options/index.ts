import { JobsOptions, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { ILogger } from '../../../common/interfaces';

export interface ExtendedJobOptions extends JobsOptions {
  deduplicationDelay?: number;
}

export interface QueueOptions {
  enabledBatchJobs: boolean;
  maxBatchSize?: number;
}

export interface QueueConfig {
  queueName: string;
  queueEvents?: QueueEvents;
  jobOptions: ExtendedJobOptions;
  queueOptions: QueueOptions;
  connection: IORedis;
  logger?: ILogger;
}
