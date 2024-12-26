import { readFileSync } from 'fs';
import { FactoryFunction } from 'tsyringe';
import IORedis, { RedisOptions } from 'ioredis';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { SERVICES } from '../common/constants';
import { IConfig, RedisConfig } from '../common/interfaces';
import { CONSTANT_BULLMQ_CONNECTION_OPTIONS, REDIS_CONNECTION_OPTIONS_SYMBOL } from './constants';

export const createConnectionOptionsFactory: FactoryFunction<RedisOptions> = (container) => {
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const redisConfig = config.get<RedisConfig>('redis');

  const { host, port, enableSslAuth, sslPaths, ...clientOptions } = redisConfig;

  const connectionOptions: RedisOptions = {
    host,
    port,
    ...clientOptions,
    ...CONSTANT_BULLMQ_CONNECTION_OPTIONS,
  };

  if (enableSslAuth) {
    connectionOptions.tls = {
      host,
      port,
      key: sslPaths.key ? readFileSync(sslPaths.key) : undefined,
      cert: sslPaths.cert ? readFileSync(sslPaths.cert) : undefined,
      ca: sslPaths.ca ? readFileSync(sslPaths.ca) : undefined,
    };
  }

  return connectionOptions;
};

export const createReusableRedisConnectionFactory: FactoryFunction<IORedis> = (container) => {
  const connectionOptions = container.resolve<RedisOptions>(REDIS_CONNECTION_OPTIONS_SYMBOL);
  const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);

  const redis = new IORedis(connectionOptions);

  cleanupRegistry.register({ id: SERVICES.REDIS, func: redis.quit.bind(redis) });

  return redis;
};
