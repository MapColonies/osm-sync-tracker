import { container, DependencyContainer } from 'tsyringe';
import { Connection } from 'typeorm';
import config from 'config';
import { Tracing, Metrics } from '@map-colonies/telemetry';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { Services } from '../../src/common/constants';
import { syncRepositorySymbol } from '../../src/sync/DAL/syncRepository';
import { fileRepositorySymbol } from '../../src/file/DAL/fileRepository';
import { entityRepositorySymbol } from '../../src/entity/DAL/entityRepository';
import { DbConfig } from '../../src/common/interfaces';
import { initConnection } from '../../src/common/db';
import { SyncRepository } from '../../src/sync/DAL/typeorm/syncRepository';
import { FileRepository } from '../../src/file/DAL/typeorm/fileRepository';
import { EntityRepository } from '../../src/entity/DAL/typeorm/entityRepository';
import { ChangesetRepository } from '../../src/changeset/DAL/typeorm/changesetRepository';
import { changesetRepositorySymbol } from '../../src/changeset/DAL/changsetRepository';
import { syncRouterFactory } from '../../src/sync/routes/syncRouter';
import fileRouterFactory from '../../src/file/routes/fileRouter';
import entityRouterFactory from '../../src/entity/routes/entityRouter';
import changesetRouterFactory from '../../src/changeset/routes/changesetRouter';

async function registerTestValues(): Promise<DependencyContainer> {
  const child = container.createChildContainer();

  child.register(Services.CONFIG, { useValue: config });
  child.register(Services.LOGGER, { useValue: jsLogger({ enabled: false }) });

  const tracing = new Tracing();
  tracing.start();
  const tracer = trace.getTracer('osm-sync-tracker');
  child.register(Services.TRACER, { useValue: tracer });

  const metrics = new Metrics(Services.METER);
  const meter = metrics.start();
  child.register(Services.METER, { useValue: meter });

  const connectionOptions = config.get<DbConfig>('db');

  const connection = await initConnection({ ...connectionOptions, entities: ['**/DAL/typeorm/*.ts'] });

  await connection.synchronize();

  child.register(Connection, { useValue: connection });

  child.register('sync', { useFactory: syncRouterFactory });
  child.register('file', { useFactory: fileRouterFactory });
  child.register('entity', { useFactory: entityRouterFactory });
  child.register('changeset', { useFactory: changesetRouterFactory });

  const syncRepo = connection.getCustomRepository(SyncRepository);
  const fileRepo = connection.getCustomRepository(FileRepository);
  const entityRepo = connection.getCustomRepository(EntityRepository);
  const changesetRepo = connection.getCustomRepository(ChangesetRepository);

  child.register(syncRepositorySymbol, { useValue: syncRepo });
  child.register(fileRepositorySymbol, { useValue: fileRepo });
  child.register(entityRepositorySymbol, { useValue: entityRepo });
  child.register(changesetRepositorySymbol, { useValue: changesetRepo });

  return child;
}

export { registerTestValues };
