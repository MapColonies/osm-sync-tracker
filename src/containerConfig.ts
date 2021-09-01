import { DependencyContainer } from 'tsyringe';
import config from 'config';
import { logMethod } from '@map-colonies/telemetry';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { Metrics } from '@map-colonies/telemetry';
import { Connection } from 'typeorm';
import { trace } from '@opentelemetry/api';
import { Services } from './common/constants';
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
import { syncRouterFactory } from './sync/routes/syncRouter';
import fileRouterFactory from './file/routes/fileRouter';
import entityRouterFactory from './entity/routes/entityRouter';
import changesetRouterFactory from './changeset/routes/changesetRouter';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  // @ts-expect-error the signature is wrong
  const logger = jsLogger({ ...loggerConfig, prettyPrint: false, hooks: { logMethod } });

  const appConfig = config.get<IApplication>('application');

  const connectionOptions = config.get<DbConfig>('db');
  const connection = await initConnection(connectionOptions);
  await connection.query(`select 1 from ${config.get<string>('db.schema')}.migrations_table`);

  const metrics = new Metrics('osm-sync-tracker');

  const meter = metrics.start();

  tracing.start();
  const tracer = trace.getTracer('osm-sync-tracker');

  const dependencies: InjectionObject<unknown>[] = [
    { token: Services.CONFIG, provider: { useValue: config } },
    { token: Services.LOGGER, provider: { useValue: logger } },
    { token: Services.TRACER, provider: { useValue: tracer } },
    { token: Services.METER, provider: { useValue: meter } },
    { token: Services.APPLICATION, provider: { useValue: appConfig } },
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
    { token: 'sync', provider: { useFactory: syncRouterFactory } },
    { token: 'file', provider: { useFactory: fileRouterFactory } },
    { token: 'entity', provider: { useFactory: entityRouterFactory } },
    { token: 'changeset', provider: { useFactory: changesetRouterFactory } },
    { token: 'healthcheck', provider: { useFactory: (container): unknown => getDbHealthCheckFunction(container.resolve<Connection>(Connection)) } },
    {
      token: 'onSignal',
      provider: {
        useValue: async (): Promise<void> => {
          await Promise.all([tracing.stop(), metrics.stop(), connection.close()]);
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
