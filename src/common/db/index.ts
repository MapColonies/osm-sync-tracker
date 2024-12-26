import { readFileSync } from 'fs';
import { HealthCheck } from '@godaddy/terminus';
import { DataSource, DataSourceOptions } from 'typeorm';
import { DependencyContainer, FactoryFunction } from 'tsyringe';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { DbConfig, IConfig } from '../interfaces';
import { promiseTimeout } from '../utils/promiseTimeout';
import { SyncDb } from '../../sync/DAL/sync';
import { Entity } from '../../entity/DAL/entity';
import { Changeset } from '../../changeset/DAL/changeset';
import { File } from '../../file/DAL/file';
import { EntityHistory } from '../../entity/DAL/entityHistory';
import { SERVICES } from '../constants';
import { Status } from '../enums';

let connectionSingleton: DataSource | undefined;

const DB_TIMEOUT = 5000;

export const DATA_SOURCE_PROVIDER = Symbol('dataSourceProvider');

export const DB_ENTITIES = [Changeset, Entity, File, SyncDb, EntityHistory];

export const createDataSourceOptions = (dbConfig: DbConfig): DataSourceOptions => {
  const { enableSslAuth, sslPaths, ...connectionOptions } = dbConfig;
  if (enableSslAuth && connectionOptions.type === 'postgres') {
    connectionOptions.password = undefined;
    connectionOptions.ssl = { key: readFileSync(sslPaths.key), cert: readFileSync(sslPaths.cert), ca: readFileSync(sslPaths.ca) };
  }
  return { entities: [...DB_ENTITIES, '**/DAL/*.js'], ...connectionOptions };
};

export const initDataSource = async (dbConfig: DbConfig): Promise<DataSource> => {
  if (connectionSingleton === undefined || !connectionSingleton.isInitialized) {
    connectionSingleton = new DataSource(createDataSourceOptions(dbConfig));
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

export const CLOSED_PARAMS: QueryDeepPartialEntity<File | SyncDb> = {
  status: Status.COMPLETED,
  endDate: (): string => 'LOCALTIMESTAMP',
};

export interface ReturningId {
  id: string;
}

export type ReturningResult<T> = [T[], number];

export const dataSourceFactory: FactoryFunction<DataSource> = (container: DependencyContainer): DataSource => {
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const dbConfig = config.get<DbConfig>('db');
  const dataSourceOptions = createDataSourceOptions(dbConfig);
  return new DataSource(dataSourceOptions);
};
