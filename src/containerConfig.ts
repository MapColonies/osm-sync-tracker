import { DependencyContainer } from 'tsyringe';
import config from 'config';
import { logMethod } from '@map-colonies/telemetry';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { Connection } from 'typeorm';
import { trace } from '@opentelemetry/api';
import { HEALTHCHECK, ON_SIGNAL, SERVICES, SERVICE_NAME } from './common/constants';
import { DbConfig, IApplication } from './common/interfaces';
import { getDbHealthCheckFunction, initConnection } from './common/db';
import { tracing } from './common/tracing';
import { ISyncRepository, syncRepositorySymbol } from './sync/DAL/syncRepository';
import { SyncRepository } from './sync/DAL/typeorm/syncRepository';
import { fileRepositorySymbol, IFileRepository } from './file/DAL/fileRepository';
import { FileRepository } from './file/DAL/typeorm/fileRepository';
import { entityRepositorySymbol, IEntityRepository } from './entity/DAL/entityRepository';
import { EntityRepository } from './entity/DAL/typeorm/entityRepository';
import { changesetRepositorySymbol, IChangesetRepository } from './changeset/DAL/changsetRepository';
import { ChangesetRepository } from './changeset/DAL/typeorm/changesetRepository';
import { syncRouterFactory, syncRouterSymbol } from './sync/routes/syncRouter';
import { fileRouterSymbol, fileRouterFactory } from './file/routes/fileRouter';
import { entityRouterFactory, entityRouterSymbol } from './entity/routes/entityRouter';
import { changesetRouterSymbol, changesetRouterFactory } from './changeset/routes/changesetRouter';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  // @ts-expect-error the signature is wrong
  const logger = jsLogger({ ...loggerConfig, hooks: { logMethod } });

  const appConfig = config.get<IApplication>('application');

  const connectionOptions = config.get<DbConfig>('db');
  const connection = await initConnection(connectionOptions);

  tracing.start();
  const tracer = trace.getTracer(SERVICE_NAME);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.APPLICATION, provider: { useValue: appConfig } },
    {
      token: Connection,
      provider: {
        useValue: connection,
      },
    },
    {
      token: fileRepositorySymbol,
      provider: {
        useFactory: (container): IFileRepository => {
          return container.resolve<Connection>(Connection).getCustomRepository(FileRepository);
        },
      },
    },
    {
      token: changesetRepositorySymbol,
      provider: {
        useFactory: (container): IChangesetRepository => {
          return container.resolve<Connection>(Connection).getCustomRepository(ChangesetRepository);
        },
      },
    },
    {
      token: syncRepositorySymbol,
      provider: {
        useFactory: (container): ISyncRepository => {
          return container.resolve<Connection>(Connection).getCustomRepository(SyncRepository);
        },
      },
    },
    {
      token: entityRepositorySymbol,
      provider: {
        useFactory: (container): IEntityRepository => {
          return container.resolve<Connection>(Connection).getCustomRepository(EntityRepository);
        },
      },
    },
    { token: syncRouterSymbol, provider: { useFactory: syncRouterFactory } },
    { token: fileRouterSymbol, provider: { useFactory: fileRouterFactory } },
    { token: entityRouterSymbol, provider: { useFactory: entityRouterFactory } },
    { token: changesetRouterSymbol, provider: { useFactory: changesetRouterFactory } },
    { token: HEALTHCHECK, provider: { useFactory: (container): unknown => getDbHealthCheckFunction(container.resolve<Connection>(Connection)) } },
    {
      token: ON_SIGNAL,
      provider: {
        useValue: async (): Promise<void> => {
          await Promise.all([tracing.stop(), connection.close()]);
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
