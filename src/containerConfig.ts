import { container } from 'tsyringe';
import config from 'config';
import { logMethod } from '@map-colonies/telemetry';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { Metrics } from '@map-colonies/telemetry';
import { Connection } from 'typeorm';
import { trace } from '@opentelemetry/api';
import { Services } from './common/constants';
import { DbConfig } from './common/interfaces';
import { getDbHealthCheckFunction, initConnection } from './common/db';
import { tracing } from './common/tracing';
import { syncRepositorySymbol } from './sync/DAL/syncRepository';
import { SyncRepository } from './sync/DAL/typeorm/syncRepository';
import { fileRepositorySymbol } from './file/DAL/fileRepository';
import { FileRepository } from './file/DAL/typeorm/fileRepository';
import { entityRepositorySymbol } from './entity/DAL/entityRepository';
import { EntityRepository } from './entity/DAL/typeorm/entityRepository';
import { changesetRepositorySymbol } from './changeset/DAL/changsetRepository';
import { ChangesetRepository } from './changeset/DAL/typeorm/entityRepository';
import { syncRouterFactory } from './sync/routes/syncRouter';
import fileRouterFactory from './file/routes/fileRouter';
import entityRouterFactory from './entity/routes/entityRouter';
import changesetRouterFactory from './changeset/routes/changesetRouter';

async function registerExternalValues(): Promise<void> {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  // @ts-expect-error the signature is wrong
  const logger = jsLogger({ ...loggerConfig, prettyPrint: false, hooks: { logMethod } });
  container.register(Services.CONFIG, { useValue: config });
  container.register(Services.LOGGER, { useValue: logger });

  const connectionOptions = config.get<DbConfig>('db');
  const connection = await initConnection(connectionOptions);

  await connection.query(`select 1 from ${config.get<string>('db.schema')}.migrations_table`);

  container.register('healthcheck', { useValue: getDbHealthCheckFunction(connection) });

  container.register(Connection, { useValue: connection });
  container.register(syncRepositorySymbol, { useValue: connection.getCustomRepository(SyncRepository) });
  container.register(fileRepositorySymbol, { useValue: connection.getCustomRepository(FileRepository) });
  container.register(entityRepositorySymbol, { useValue: connection.getCustomRepository(EntityRepository) });
  container.register(changesetRepositorySymbol, { useValue: connection.getCustomRepository(ChangesetRepository) });

  container.register('sync', { useFactory: syncRouterFactory });
  container.register('file', { useFactory: fileRouterFactory });
  container.register('entity', { useFactory: entityRouterFactory });
  container.register('changeset', { useFactory: changesetRouterFactory });

  tracing.start();
  const tracer = trace.getTracer('osm-sync-tracker');
  container.register(Services.TRACER, { useValue: tracer });

  const metrics = new Metrics('app_meter');
  const meter = metrics.start();
  container.register(Services.METER, { useValue: meter });
  container.register('onSignal', {
    useValue: async (): Promise<void> => {
      await Promise.all([tracing.stop(), metrics.stop(), connection.close()]);
    },
  });
}

export { registerExternalValues };
