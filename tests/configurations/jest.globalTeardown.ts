import config from 'config';
import IORedis from 'ioredis';
import { initDataSource } from '../../src/common/db';
import { DbConfig, RedisConfig } from '../../src/common/interfaces';
import { clearQueues, clearRepositories } from '../integration/helpers';
import { constructConnectionOptions } from '../../src/queueProvider/connection';

export default async (): Promise<void> => {
  const dataSourceOptions = config.get<DbConfig>('db');
  const connection = await initDataSource(dataSourceOptions);
  await clearRepositories(connection);
  await connection.destroy();

  const redisConfig = config.get<RedisConfig>('redis');
  const redisOptions = constructConnectionOptions(redisConfig);
  const redis = new IORedis(redisOptions);
  await clearQueues(redis);
  redis.disconnect();
};
