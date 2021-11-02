import { readFileSync } from 'fs';
import { HealthCheck } from '@godaddy/terminus';
import { Connection, ConnectionOptions, createConnection, QueryFailedError } from 'typeorm';
import { DbConfig } from '../interfaces';
import { promiseTimeout } from '../utils/promiseTimeout';
import { SyncDb } from '../../sync/DAL/typeorm/sync';
import { Entity } from '../../entity/DAL/typeorm/entity';
import { Changeset } from '../../changeset/DAL/typeorm/changeset';
import { File } from '../../file/DAL/typeorm/file';

let connectionSingleton: Connection | undefined;

const DB_TIMEOUT = 5000;

enum TransactionFailure {
  SERIALIZATION_FAILURE = '40001',
  DEADLOCK_DETECTED = '40P01',
}

interface QueryFailedErrorWithCode extends QueryFailedError {
  code: string | undefined;
}

export const isTransactionFailure = (error: QueryFailedError): boolean => {
  const code = (error as QueryFailedErrorWithCode).code;
  return code === TransactionFailure.SERIALIZATION_FAILURE || code === TransactionFailure.DEADLOCK_DETECTED;
};

export const DB_ENTITIES = [Changeset, Entity, File, SyncDb];

export const createConnectionOptions = (dbConfig: DbConfig): ConnectionOptions => {
  const { enableSslAuth, sslPaths, ...connectionOptions } = dbConfig;
  if (enableSslAuth && connectionOptions.type === 'postgres') {
    connectionOptions.password = undefined;
    connectionOptions.ssl = { key: readFileSync(sslPaths.key), cert: readFileSync(sslPaths.cert), ca: readFileSync(sslPaths.ca) };
  }
  return { entities: [...DB_ENTITIES, '**/DAL/typeorm/*.js'], ...connectionOptions };
};

export const initConnection = async (dbConfig: DbConfig): Promise<Connection> => {
  if (connectionSingleton === undefined || !connectionSingleton.isConnected) {
    connectionSingleton = await createConnection(createConnectionOptions(dbConfig));
  }
  return connectionSingleton;
};

export const getDbHealthCheckFunction = (connection: Connection): HealthCheck => {
  return async (): Promise<void> => {
    const check = connection.query('SELECT 1').then(() => {
      return;
    });
    return promiseTimeout<void>(DB_TIMEOUT, check);
  };
};

export type UpdateResult<T> = [T[], number];
