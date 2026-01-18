import { WorkerOptions } from 'bullmq';
import ioRedis from 'ioredis';
import { Registry } from 'prom-client';
import { ILogger } from '@src/common/interfaces';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

export interface ExtendedWorkerOptions extends WorkerOptions {
  transactionIsolationLevel: IsolationLevel;
  transactionFailureDelay: {
    minimum: number;
    maximum: number;
  };
}

export interface WorkerProducerOptions {
  workerOptions: ExtendedWorkerOptions;
  connection: ioRedis;
  logger: ILogger;
  metricsRegistry?: Registry;
}
