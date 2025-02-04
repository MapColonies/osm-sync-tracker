import { DataSourceOptions } from 'typeorm';
import { RedisOptions } from 'ioredis';
import { ExtendedJobOptions, QueueOptions } from '../queueProvider/queues/options';
import { ExtendedWorkerOptions } from '../queueProvider/workers/options';

interface LogFn {
  (obj: unknown, msg?: string, ...args: unknown[]): void;
  (msg: string, ...args: unknown[]): void;
}

export interface IServerConfig {
  port: string;
}

export type DbConfig = {
  enableSslAuth: boolean;
  sslPaths: { ca: string; cert: string; key: string };
} & DataSourceOptions;

export type RedisConfig = {
  host: string;
  port: number;
  enableSslAuth: boolean;
  sslPaths: { ca: string; cert: string; key: string };
} & RedisOptions;

export interface ILogger {
  trace?: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal?: LogFn;
}

export type QueueName = 'changesets' | 'files' | 'syncs';

export interface ClosureQueueConfig {
  queueOptions: QueueOptions;
  jobOptions: ExtendedJobOptions;
  workerOptions: ExtendedWorkerOptions;
}

export interface ClosureConfig {
  uiPath: string;
  queues: {
    [key in QueueName]: ClosureQueueConfig;
  };
}
