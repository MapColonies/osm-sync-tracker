import { container } from 'tsyringe';
import config from 'config';
import { logMethod } from '@map-colonies/telemetry';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { Metrics } from '@map-colonies/telemetry';
import { Connection } from 'typeorm';
import { Services } from './common/constants';
import { DbConfig } from './common/interfaces';
import { getDbHealthCheckFunction, initConnection } from './common/db';
import { tracing } from './common/tracing';
import { syncRepositorySymbol } from './sync/DAL/syncRepository';
import { TypeormSyncRepository } from './sync/DAL/typeorm/typeormSyncRepository';
import { fileRepositorySymbol } from './file/DAL/fileRepository';
import { TypeormFileRepository } from './file/DAL/typeorm/typeormFileRepository';
import { entityRepositorySymbol } from './entity/DAL/entityRepository';
import { TypeormEntityRepository } from './entity/DAL/typeorm/typeormEntityRepository';
import { changesetRepositorySymbol } from './changeset/DAL/changsetRepository';
import { TypeormChangesetRepository } from './changeset/DAL/typeorm/typeormEntityRepository';
import { syncRouterFactory } from './sync/routes/syncRouter';
import fileRouterFactory from './file/routes/fileRouter';
import entityRouterFactory from './entity/routes/entityRouter';
import changesetRouterFactory from './changeset/routes/changesetRouter';

async function registerExternalValues(): Promise<void> {
  const loggerConfig = config.get<LoggerOptions>('logger');
  // @ts-expect-error the signature is wrong
  const logger = jsLogger({ ...loggerConfig, prettyPrint: false, hooks: { logMethod } });
  container.register(Services.CONFIG, { useValue: config });
  container.register(Services.LOGGER, { useValue: logger });

  const connectionOptions = config.get<DbConfig>('db');
  const connection = await initConnection(connectionOptions);

  await connection.query(`select 1 from ${config.get<string>('db.schema')}.migrations_table`);

  container.register('healthcheck', { useValue: getDbHealthCheckFunction(connection) });

  container.register(Connection, { useValue: connection });
  container.register(syncRepositorySymbol, { useValue: connection.getCustomRepository(TypeormSyncRepository) });
  container.register(fileRepositorySymbol, { useValue: connection.getCustomRepository(TypeormFileRepository) });
  container.register(entityRepositorySymbol, { useValue: connection.getCustomRepository(TypeormEntityRepository) });
  container.register(changesetRepositorySymbol, { useValue: connection.getCustomRepository(TypeormChangesetRepository) });

  container.register('sync', { useFactory: syncRouterFactory });
  container.register('file', { useFactory: fileRouterFactory });
  container.register('entity', { useFactory: entityRouterFactory });
  container.register('changeset', { useFactory: changesetRouterFactory });

  const tracer = tracing.start();
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
