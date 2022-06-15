import config from 'config';
import { initDataSource } from '../../src/common/db';
import { DbConfig } from '../../src/common/interfaces';
import { clearRepositories } from '../integration/helpers';

export default async (): Promise<void> => {
  const dataSourceOptions = config.get<DbConfig>('db');
  const connection = await initDataSource(dataSourceOptions);
  await clearRepositories(connection);
  await connection.destroy();
};
