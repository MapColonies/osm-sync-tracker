import { DataSource } from 'typeorm';
import { initConfig, getConfig } from './src/common/config';
import { createDataSourceOptions } from './src/common/db';
import { DbConfig } from './src/common/interfaces';

const dataSourceFactory = async (): Promise<DataSource> => {
  await initConfig(true);
  const config = getConfig();
  const connectionOptions = config.get('db') as DbConfig;

  const appDataSource = new DataSource({
    ...createDataSourceOptions(connectionOptions),
    entities: ['src/**/DAL/*.ts'],
    migrationsTableName: 'migrations_table',
    migrations: ['db/migrations/*.ts'],
  });

  return appDataSource;
};

export default dataSourceFactory();
