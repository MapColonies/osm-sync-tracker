import { container } from 'tsyringe';
import config from 'config';
import { logMethod } from '@map-colonies/telemetry';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { Metrics } from '@map-colonies/telemetry';
import { Connection } from 'typeorm';
import faker from 'faker';
import { Services } from './common/constants';
import { DbConfig } from './common/interfaces';
import { getDbHealthCheckFunction, initConnection } from './common/db';
import { tracing } from './common/tracing';
import { Sync } from './sync/models/sync';
import { File } from './file/models/file';

async function registerExternalValues(): Promise<void> {
  const loggerConfig = config.get<LoggerOptions>('logger');
  // @ts-expect-error the signature is wrong
  const logger = jsLogger({ ...loggerConfig, prettyPrint: false, hooks: { logMethod } });
  container.register(Services.CONFIG, { useValue: config });
  container.register(Services.LOGGER, { useValue: logger });

  const connectionOptions = config.get<DbConfig>('db');
  const connection = await initConnection({ entities: ['*/models/*.js'], logging: ['query'], ...connectionOptions });

  container.register('healthcheck', { useValue: getDbHealthCheckFunction(connection) });

  container.register(Connection, { useValue: connection });

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
