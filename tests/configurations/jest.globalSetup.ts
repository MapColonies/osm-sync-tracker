import config from 'config';
import { createConnection } from 'typeorm';
import { DbConfig } from '../../src/common/interfaces';
import { createConnectionOptions } from '../../src/common/db/index';

export default async (): Promise<void> => {
  const connectionOptionsConfig = config.get<DbConfig>('db');
  const connectionOptions = createConnectionOptions(connectionOptionsConfig);
  await createConnection({ ...connectionOptions });
};
