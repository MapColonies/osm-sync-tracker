import config from 'config';
import { createConnectionOptions } from './src/common/db/';
import { DbConfig } from './src/common/interfaces';

const connectionOptions = config.get<DbConfig>('db');

module.exports = {
  ...createConnectionOptions(connectionOptions),
  entities: ['src/*/models/*.ts'],
  migrationsTableName: 'migrations_table',
  migrations: ['db/migrations/*.ts'],
  cli: {
    migrationsDir: 'db/migrations',
  },
};
