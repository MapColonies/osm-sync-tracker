import { container } from 'tsyringe';
import { Connection } from 'typeorm';
import config from 'config';
import { Tracing, Metrics } from '@map-colonies/telemetry';
import jsLogger from '@map-colonies/js-logger';
import { Services } from '../../src/common/constants';
import { syncRepositorySymbol } from '../../src/sync/DAL/syncRepository';
import { fileRepositorySymbol } from '../../src/file/DAL/fileRepository';
import { entityRepositorySymbol } from '../../src/entity/DAL/entityRepository';
import { DbConfig } from '../../src/common/interfaces';
import { initConnection } from '../../src/common/db';
import { TypeormSyncRepository } from '../../src/sync/DAL/typeorm/typeormSyncRepository';
import { TypeormFileRepository } from '../../src/file/DAL/typeorm/typeormFileRepository';
import { TypeormEntityRepository } from '../../src/entity/DAL/typeorm/typeormEntityRepository';
import { TypeormChangesetRepository } from '../../src/changeset/DAL/typeorm/typeormEntityRepository';
import { changesetRepositorySymbol } from '../../src/changeset/DAL/changsetRepository';

async function registerTestValues(): Promise<void> {
  container.register(Services.CONFIG, { useValue: config });
  container.register(Services.LOGGER, { useValue: jsLogger({ enabled: false }) });

  const tracing = new Tracing('app_tracer');
  const tracer = tracing.start();
  container.register(Services.TRACER, { useValue: tracer });

  const metrics = new Metrics('app_meter');
  const meter = metrics.start();
  container.register(Services.METER, { useValue: meter });

  const connectionOptions = config.get<DbConfig>('db');
  const connection = await initConnection({ ...connectionOptions, entities: ['**/DAL/typeorm/*.ts'] });

  await connection.synchronize();

  container.register(Connection, { useValue: connection });

  const syncRepo = connection.getCustomRepository(TypeormSyncRepository);
  const fileRepo = connection.getCustomRepository(TypeormFileRepository);
  const entityRepo = connection.getCustomRepository(TypeormEntityRepository);
  const changesetRepo = connection.getCustomRepository(TypeormChangesetRepository);

  container.register(syncRepositorySymbol, { useValue: syncRepo });
  container.register(fileRepositorySymbol, { useValue: fileRepo });
  container.register(entityRepositorySymbol, { useValue: entityRepo });
  container.register(changesetRepositorySymbol, { useValue: changesetRepo });
}

export { registerTestValues };
