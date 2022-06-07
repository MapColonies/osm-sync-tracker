import { readFileSync } from 'fs';
import { HealthCheck } from '@godaddy/terminus';
import { DataSource, DataSourceOptions, QueryFailedError } from 'typeorm';
import { DbConfig } from '../interfaces';
import { promiseTimeout } from '../utils/promiseTimeout';
import { SyncDb } from '../../sync/DAL/sync';
import { Entity } from '../../entity/DAL/entity';
import { Changeset } from '../../changeset/DAL/changeset';
import { File } from '../../file/DAL/file';
import { EntityHistory } from '../../entity/DAL/entityHistory';

let connectionSingleton: DataSource | undefined;

const DB_TIMEOUT = 5000;

enum TransactionFailure {
  SERIALIZATION_FAILURE = '40001',
  DEADLOCK_DETECTED = '40P01',
}

interface QueryFailedErrorWithCode extends QueryFailedError {
  code: string | undefined;
}

export const isTransactionFailure = (error: unknown): boolean => {
  if (error instanceof QueryFailedError) {
    const code = (error as QueryFailedErrorWithCode).code;
    return code === TransactionFailure.SERIALIZATION_FAILURE || code === TransactionFailure.DEADLOCK_DETECTED;
  }
  return false;
};

export const DB_ENTITIES = [Changeset, Entity, File, SyncDb, EntityHistory];

export const createConnectionOptions = (dbConfig: DbConfig): DataSourceOptions => {
  const { enableSslAuth, sslPaths, ...connectionOptions } = dbConfig;
  if (enableSslAuth && connectionOptions.type === 'postgres') {
    connectionOptions.password = undefined;
    connectionOptions.ssl = { key: readFileSync(sslPaths.key), cert: readFileSync(sslPaths.cert), ca: readFileSync(sslPaths.ca) };
  }
  return { entities: [...DB_ENTITIES, '**/DAL/*.js'], ...connectionOptions };
};

export const initDataSource = async (dbConfig: DbConfig): Promise<DataSource> => {
  if (connectionSingleton === undefined || !connectionSingleton.isInitialized) {
    connectionSingleton = new DataSource(createConnectionOptions(dbConfig));
    await connectionSingleton.initialize();
  }
  return connectionSingleton;
};

export const getDbHealthCheckFunction = (connection: DataSource): HealthCheck => {
  return async (): Promise<void> => {
    const check = connection.query('SELECT 1').then(() => {
      return;
    });
    return promiseTimeout<void>(DB_TIMEOUT, check);
  };
};

export interface ReturningId {
  id: string;
}

export type ReturningResult<T> = [T[], number];
