import config from 'config';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from './src/common/db';
import { DbConfig } from './src/common/interfaces';

const connectionOptions = config.get<DbConfig>('db');

export const appDataSource = new DataSource({
  ...createDataSourceOptions(connectionOptions),
  entities: ['src/**/DAL/*.ts'],
  migrationsTableName: 'migrations_table',
  migrations: ['db/migrations/*.ts'],
});
