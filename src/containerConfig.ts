import { DependencyContainer, instancePerContainerCachingFactory, Lifecycle } from 'tsyringe';
import { getOtelMixin } from '@map-colonies/telemetry';
import jsLogger, { Logger } from '@map-colonies/js-logger';
import { DataSource } from 'typeorm';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { trace } from '@opentelemetry/api';
import { HealthCheck } from '@godaddy/terminus';
import { Registry } from 'prom-client';
import { Worker } from 'bullmq';
import { addTransactionalDataSource, initializeTransactionalContext, StorageDriver } from 'typeorm-transactional';
import { HEALTHCHECK, ON_SIGNAL, SERVICES, SERVICE_NAME } from './common/constants';
import { DATA_SOURCE_PROVIDER, dataSourceFactory, getDbHealthCheckFunction } from './common/db';
import { getTracing } from './common/tracing';
import { syncRepositoryFactory, SYNC_CUSTOM_REPOSITORY_SYMBOL } from './sync/DAL/syncRepository';
import { entityRepositoryFactory, ENTITY_CUSTOM_REPOSITORY_SYMBOL } from './entity/DAL/entityRepository';
import { changesetRepositoryFactory, CHANGESET_CUSTOM_REPOSITORY_SYMBOL } from './changeset/DAL/changesetRepository';
import { syncRouterFactory, SYNC_ROUTER_SYMBOL } from './sync/routes/syncRouter';
import { FILE_ROUTER_SYMBOL, fileRouterFactory } from './file/routes/fileRouter';
import { entityRouterFactory, ENTITY_ROUTER_SYMBOL } from './entity/routes/entityRouter';
import { CHANGESET_ROUTER_SYMBOL, changesetRouterFactory } from './changeset/routes/changesetRouter';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { fileRepositoryFactory, FILE_CUSTOM_REPOSITORY_SYMBOL } from './file/DAL/fileRepository';
import { FILES_QUEUE_WORKER_FACTORY, FILES_QUEUE_WORKER_NAME, filesQueueWorkerFactory } from './queueProvider/workers/filesQueueWorker';
import {
  CHANGESETS_QUEUE_WORKER_FACTORY,
  CHANGESETS_QUEUE_WORKER_NAME,
  changesetsQueueWorkerFactory,
} from './queueProvider/workers/changesetsQueueWorker';
import { SYNCS_QUEUE_WORKER_FACTORY, SYNCS_QUEUE_WORKER_NAME, syncsQueueWorkerFactory } from './queueProvider/workers/syncsQueueWorker';
import { BullQueueProviderFactory } from './queueProvider/queues/bullQueueProviderFactory';
import {
  CHANGESETS_QUEUE_NAME,
  FILES_QUEUE_NAME,
  QUEUE_PROVIDER_FACTORY,
  CLOSURE_WORKERS_INITIALIZER,
  REDIS_CONNECTION_OPTIONS_SYMBOL,
  SYNCS_QUEUE_NAME,
} from './queueProvider/constants';
import { createConnectionOptionsFactory, createReusableRedisConnectionFactory } from './queueProvider/connection';
import { ConfigType, getConfig } from './common/config';

const registerClosureDeps = (): InjectionObject<unknown>[] => {
  const closureDependencies: InjectionObject<unknown>[] = [
    { token: REDIS_CONNECTION_OPTIONS_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(createConnectionOptionsFactory) } },
    { token: SERVICES.REDIS, provider: { useFactory: instancePerContainerCachingFactory(createReusableRedisConnectionFactory) } },
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
    {
      token: CHANGESETS_QUEUE_WORKER_FACTORY,
      provider: { useFactory: instancePerContainerCachingFactory(changesetsQueueWorkerFactory) },
      postInjectionHook(container): void {
        const worker = container.resolve<Worker>(CHANGESETS_QUEUE_WORKER_FACTORY);
        const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
        cleanupRegistry.register({ id: CHANGESETS_QUEUE_WORKER_NAME, func: worker.close.bind(worker) });
      },
    },
    {
      token: FILES_QUEUE_WORKER_FACTORY,
      provider: { useFactory: instancePerContainerCachingFactory(filesQueueWorkerFactory) },
      postInjectionHook(container): void {
        const worker = container.resolve<Worker>(FILES_QUEUE_WORKER_FACTORY);
        const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
        cleanupRegistry.register({ id: FILES_QUEUE_WORKER_NAME, func: worker.close.bind(worker) });
      },
    },
    {
      token: SYNCS_QUEUE_WORKER_FACTORY,
      provider: { useFactory: instancePerContainerCachingFactory(syncsQueueWorkerFactory) },
      postInjectionHook(container): void {
        const worker = container.resolve<Worker>(SYNCS_QUEUE_WORKER_FACTORY);
        const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
        cleanupRegistry.register({ id: SYNCS_QUEUE_WORKER_NAME, func: worker.close.bind(worker) });
      },
    },
    {
      token: CLOSURE_WORKERS_INITIALIZER,
      provider: {
        useFactory: (container): (() => Promise<void>) => {
          const changesetWorker = container.resolve<Worker>(CHANGESETS_QUEUE_WORKER_FACTORY);
          const fileWorker = container.resolve<Worker>(FILES_QUEUE_WORKER_FACTORY);
          const syncWorker = container.resolve<Worker>(SYNCS_QUEUE_WORKER_FACTORY);
          return async (): Promise<void> => {
            await Promise.all([changesetWorker.run(), fileWorker.run(), syncWorker.run()]);
          };
        },
      },
    },
  ];

  return closureDependencies;
};

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const cleanupRegistry = new CleanupRegistry();

  try {
    const dependencies: InjectionObject<unknown>[] = [
      { token: SERVICES.CONFIG, provider: { useValue: getConfig() } },
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
      {
        token: SERVICES.LOGGER,
        provider: {
          useFactory: instancePerContainerCachingFactory((container) => {
            const config = container.resolve<ConfigType>(SERVICES.CONFIG);
            const loggerConfig = config.get('telemetry.logger');
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
            cleanupRegistry.register({ id: SERVICES.TRACER, func: getTracing().stop.bind(getTracing()) });
            const tracer = trace.getTracer(SERVICE_NAME);
            return tracer;
          }),
        },
      },
      {
        token: SERVICES.METRICS,
        provider: {
          useFactory: instancePerContainerCachingFactory((container) => {
            const metricsRegistry = new Registry();
            const config = container.resolve<ConfigType>(SERVICES.CONFIG);
            config.initializeMetrics(metricsRegistry);
            return metricsRegistry;
          }),
        },
      },
      {
        token: DATA_SOURCE_PROVIDER,
        provider: { useFactory: instancePerContainerCachingFactory(dataSourceFactory) },
        postInjectionHook: async (deps: DependencyContainer): Promise<void> => {
          const dataSource = deps.resolve<DataSource>(DATA_SOURCE_PROVIDER);
          if (!dataSource.isInitialized) {
            await dataSource.initialize();
            initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
            addTransactionalDataSource(dataSource);
            cleanupRegistry.register({ id: DATA_SOURCE_PROVIDER, func: dataSource.destroy.bind(dataSource) });
          }
        },
      },
      { token: FILE_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: fileRepositoryFactory } },
      { token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: changesetRepositoryFactory } },
      { token: SYNC_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: syncRepositoryFactory } },
      { token: ENTITY_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: entityRepositoryFactory } },
      { token: SYNC_ROUTER_SYMBOL, provider: { useFactory: syncRouterFactory } },
      { token: FILE_ROUTER_SYMBOL, provider: { useFactory: fileRouterFactory } },
      { token: ENTITY_ROUTER_SYMBOL, provider: { useFactory: entityRouterFactory } },
      { token: CHANGESET_ROUTER_SYMBOL, provider: { useFactory: changesetRouterFactory } },
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
      ...registerClosureDeps(),
    ];

    const container = await registerDependencies(dependencies, options?.override, options?.useChild);
    return container;
  } catch (error) {
    await cleanupRegistry.trigger();
    throw error;
  }
};
