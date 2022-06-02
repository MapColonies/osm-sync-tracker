import config from 'config';
import { DataSource } from 'typeorm';
import { createConnectionOptions } from './src/common/db';
import { DbConfig } from './src/common/interfaces';

const connectionOptions = config.get<DbConfig>('db');

module.exports = new DataSource({
  ...createConnectionOptions(connectionOptions),
  entities: ['src/**/DAL/typeorm/*.ts'],
  migrationsTableName: 'migrations_table',
  migrations: ['db/migrations/*.ts'],
  cli: {
    migrationsDir: 'db/migrations',
  },
});
