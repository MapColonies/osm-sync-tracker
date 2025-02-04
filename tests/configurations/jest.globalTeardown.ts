import IORedis from 'ioredis';
import { getConfig, initConfig } from '../../src/common/config';
import { getCachedDataSource } from '../../src/common/db';
import { DbConfig, RedisConfig } from '../../src/common/interfaces';
import { clearQueues, clearRepositories } from '../integration/helpers';
import { constructConnectionOptions } from '../../src/queueProvider/connection';

export default async (): Promise<void> => {
  await initConfig(true);

  const config = getConfig();
  const dataSourceOptions = config.get('db') as DbConfig;
  const connection = getCachedDataSource(dataSourceOptions);
  await connection.initialize();
  await clearRepositories(connection);
  await connection.destroy();

  const redisConfig = config.get('redis') as RedisConfig;
  const redisOptions = constructConnectionOptions(redisConfig);
  const redis = new IORedis(redisOptions);
  await clearQueues(redis);
  redis.disconnect();
};
