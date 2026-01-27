import { JobsOptions, Queue, QueueEvents } from 'bullmq';
import { Registry } from 'prom-client';
import { ILogger } from '../../../common/interfaces';

export interface ExtendedJobOptions extends JobsOptions {
  deduplicationDelay?: number;
  deduplicationTtl?: number;
}

export interface QueueOptions {
  enabledBatchJobs: boolean;
  maxBatchSize?: number;
}

export interface QueueConfig {
  queue: Queue;
  queueName: string;
  queueEvents?: QueueEvents;
  queueOptions: QueueOptions;
  jobOptions: ExtendedJobOptions;
  logger?: ILogger;
  metricsRegistry?: Registry;
}
