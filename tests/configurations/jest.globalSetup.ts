import config from 'config';
import { DbConfig } from '../../src/common/interfaces';
import { initConnection } from '../../src/common/db/index';

export default async (): Promise<void> => {
  const connectionOptions = config.get<DbConfig>('db');
  const connection = await initConnection({ ...connectionOptions });
  await connection.synchronize();
};
