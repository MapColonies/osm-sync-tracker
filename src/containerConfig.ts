import { DependencyContainer, instancePerContainerCachingFactory, Lifecycle } from 'tsyringe';
import config from 'config';
import { getOtelMixin } from '@map-colonies/telemetry';
import jsLogger, { Logger, LoggerOptions } from '@map-colonies/js-logger';
import { DataSource } from 'typeorm';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { trace } from '@opentelemetry/api';
import { HealthCheck } from '@godaddy/terminus';
import { DB_SCHEMA, HEALTHCHECK, ON_SIGNAL, SERVICES, SERVICE_NAME } from './common/constants';
import { IConfig } from './common/interfaces';
import { DATA_SOURCE_PROVIDER, dataSourceFactory, getDbHealthCheckFunction } from './common/db';
import { tracing } from './common/tracing';
import { syncRepositoryFactory, SYNC_CUSTOM_REPOSITORY_SYMBOL } from './sync/DAL/syncRepository';
import { entityRepositoryFactory, ENTITY_CUSTOM_REPOSITORY_SYMBOL } from './entity/DAL/entityRepository';
import { changesetRepositoryFactory, CHANGESET_CUSTOM_REPOSITORY_SYMBOL } from './changeset/DAL/changesetRepository';
import { syncRouterFactory, syncRouterSymbol } from './sync/routes/syncRouter';
import { fileRouterSymbol, fileRouterFactory } from './file/routes/fileRouter';
import { entityRouterFactory, entityRouterSymbol } from './entity/routes/entityRouter';
import { changesetRouterSymbol, changesetRouterFactory } from './changeset/routes/changesetRouter';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { fileRepositoryFactory, FILE_CUSTOM_REPOSITORY_SYMBOL } from './file/DAL/fileRepository';
import { FILES_QUEUE_WORKER_FACTORY, filesQueueWorkerFactory } from './queueProvider/workers/filesQueueWorker';
import { CHANGESETS_QUEUE_WORKER_FACTORY, changesetsQueueWorkerFactory } from './queueProvider/workers/changesetsQueueWorker';
import { SYNCS_QUEUE_WORKER_FACTORY, syncsQueueWorkerFactory } from './queueProvider/workers/syncsQueueWorker';
import { BullQueueProviderFactory } from './queueProvider/queues/bullQueueProviderFactory';
import {
  CHANGESETS_QUEUE_NAME,
  FILES_QUEUE_NAME,
  QUEUE_PROVIDER_FACTORY,
  REDIS_CONNECTION_OPTIONS_SYMBOL,
  SYNCS_QUEUE_NAME,
} from './queueProvider/constants';
import { createConnectionOptionsFactory, createReusableRedisConnectionFactory } from './queueProvider/connection';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const cleanupRegistry = new CleanupRegistry();

  try {
    const dependencies: InjectionObject<unknown>[] = [
      { token: SERVICES.CONFIG, provider: { useValue: config } },
      {
        token: SERVICES.CLEANUP_REGISTRY,
        provider: { useValue: cleanupRegistry },
        afterAllInjectionHook(container): void {
          const logger = container.resolve<Logger>(SERVICES.LOGGER);
          const cleanupRegistryLogger = logger.child({ subComponent: 'cleanupRegistry' });

          cleanupRegistry.on('itemFailed', (id, error, msg) => cleanupRegistryLogger.error({ msg, itemId: id, err: error }));
          cleanupRegistry.on('itemCompleted', (id) => cleanupRegistryLogger.info({ itemId: id, msg: 'cleanup finished for item' }));
          cleanupRegistry.on('finished', (status) => cleanupRegistryLogger.info({ msg: `cleanup registry finished cleanup`, status }));
        },
      },
      { token: DB_SCHEMA, provider: { useValue: config.get('db.schema') } },
      {
        token: SERVICES.LOGGER,
        provider: {
          useFactory: instancePerContainerCachingFactory((container) => {
            const config = container.resolve<IConfig>(SERVICES.CONFIG);
            const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
            const logger = jsLogger({ ...loggerConfig, mixin: getOtelMixin() });
            return logger;
          }),
        },
      },
      {
        token: SERVICES.TRACER,
        provider: {
          useFactory: instancePerContainerCachingFactory((container) => {
            const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
            cleanupRegistry.register({ func: tracing.stop.bind(tracing), id: SERVICES.TRACER });
            const tracer = trace.getTracer(SERVICE_NAME);
            return tracer;
          }),
        },
      },
      {
        token: DATA_SOURCE_PROVIDER,
        provider: { useFactory: instancePerContainerCachingFactory(dataSourceFactory) },
        postInjectionHook: async (deps: DependencyContainer): Promise<void> => {
          const dataSource = deps.resolve<DataSource>(DATA_SOURCE_PROVIDER);
          cleanupRegistry.register({ func: dataSource.destroy.bind(dataSource), id: DATA_SOURCE_PROVIDER });
          await dataSource.initialize();
        },
      },
      { token: REDIS_CONNECTION_OPTIONS_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(createConnectionOptionsFactory) } },
      { token: SERVICES.REDIS, provider: { useFactory: instancePerContainerCachingFactory(createReusableRedisConnectionFactory) } },
      { token: FILE_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: fileRepositoryFactory } },
      { token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: changesetRepositoryFactory } },
      { token: SYNC_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: syncRepositoryFactory } },
      { token: ENTITY_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: entityRepositoryFactory } },
      {
        token: QUEUE_PROVIDER_FACTORY,
        provider: { useClass: BullQueueProviderFactory },
        options: { lifecycle: Lifecycle.Singleton },
        postInjectionHook: (deps: DependencyContainer): void => {
          const queueFactory = deps.resolve<BullQueueProviderFactory>(QUEUE_PROVIDER_FACTORY);
          const cleanupRegistry = deps.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);

          for (const queueName of [CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, SYNCS_QUEUE_NAME]) {
            const queue = queueFactory.createQueue(queueName);
            deps.register(queueName, { useValue: queue });
            cleanupRegistry.register({ id: queueName, func: queue.close.bind(queue) });
          }
        },
      },
      { token: syncRouterSymbol, provider: { useFactory: syncRouterFactory } },
      { token: fileRouterSymbol, provider: { useFactory: fileRouterFactory } },
      { token: entityRouterSymbol, provider: { useFactory: entityRouterFactory } },
      { token: changesetRouterSymbol, provider: { useFactory: changesetRouterFactory } },
      { token: FILES_QUEUE_WORKER_FACTORY, provider: { useFactory: filesQueueWorkerFactory } },
      { token: CHANGESETS_QUEUE_WORKER_FACTORY, provider: { useFactory: changesetsQueueWorkerFactory } },
      { token: SYNCS_QUEUE_WORKER_FACTORY, provider: { useFactory: syncsQueueWorkerFactory } },
      {
        token: HEALTHCHECK,
        provider: {
          useFactory: (container): HealthCheck => {
            const dataSource = container.resolve<DataSource>(DATA_SOURCE_PROVIDER);
            return getDbHealthCheckFunction(dataSource);
          },
        },
      },
      {
        token: ON_SIGNAL,
        provider: {
          useValue: cleanupRegistry.trigger.bind(cleanupRegistry),
        },
      },
    ];

    const container = await registerDependencies(dependencies, options?.override, options?.useChild);
    return container;
  } catch (error) {
    await cleanupRegistry.trigger();
    throw error;
  }
};
