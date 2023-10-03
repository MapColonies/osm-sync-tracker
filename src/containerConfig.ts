import { DependencyContainer, instancePerContainerCachingFactory } from 'tsyringe';
import client from 'prom-client';
import config from 'config';
import { getOtelMixin } from '@map-colonies/telemetry';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { DataSource } from 'typeorm';
import { trace } from '@opentelemetry/api';
import { DB_SCHEMA, HEALTHCHECK, ON_SIGNAL, SERVICES, SERVICE_NAME, METRICS_REGISTRY } from './common/constants';
import { DbConfig, IApplication, IConfig } from './common/interfaces';
import { getDbHealthCheckFunction, initDataSource } from './common/db';
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

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  const logger = jsLogger({ ...loggerConfig, mixin: getOtelMixin() });

  const appConfig = config.get<IApplication>('application');

  const dataSourceOptions = config.get<DbConfig>('db');
  const connection = await initDataSource(dataSourceOptions);

  const tracer = trace.getTracer(SERVICE_NAME);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: DB_SCHEMA, provider: { useValue: config.get('db.schema') } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    {
      token: METRICS_REGISTRY,
      provider: {
        useFactory: instancePerContainerCachingFactory((container) => {
          const config = container.resolve<IConfig>(SERVICES.CONFIG);

          if (config.get<boolean>('telemetry.metrics.enabled')) {
            return client.register;
          }
        }),
      },
    },
    { token: SERVICES.APPLICATION, provider: { useValue: appConfig } },
    { token: DataSource, provider: { useValue: connection } },
    { token: FILE_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: fileRepositoryFactory } },
    { token: CHANGESET_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: changesetRepositoryFactory } },
    { token: SYNC_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: syncRepositoryFactory } },
    { token: ENTITY_CUSTOM_REPOSITORY_SYMBOL, provider: { useFactory: entityRepositoryFactory } },
    { token: syncRouterSymbol, provider: { useFactory: syncRouterFactory } },
    { token: fileRouterSymbol, provider: { useFactory: fileRouterFactory } },
    { token: entityRouterSymbol, provider: { useFactory: entityRouterFactory } },
    { token: changesetRouterSymbol, provider: { useFactory: changesetRouterFactory } },
    { token: HEALTHCHECK, provider: { useFactory: (container): unknown => getDbHealthCheckFunction(container.resolve<DataSource>(DataSource)) } },
    {
      token: ON_SIGNAL,
      provider: {
        useValue: async (): Promise<void> => {
          await Promise.all([tracing.stop(), connection.destroy()]);
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
