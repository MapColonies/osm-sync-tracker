import config from 'config';
import { createConnection } from 'typeorm';
import { DbConfig } from '../../src/common/interfaces';
import { createConnectionOptions } from '../../src/common/db/index';
import { initialMigration1621858416252 } from '../../db/migrations/1621858416252-initialMigration';
import { addFileIdConstraintToEntity1623568810719 } from '../../db/migrations/1623568810719-addFileIdConstraintToEntity';
import { addEntityIndex1635784228947 } from '../../db/migrations/1635784228947-addEntityIndex';
import { addSyncGeometryType1640244548987 } from '../../db/migrations/1640244548987-addSyncGeometryType';
import { addSyncRerunCompatibility1642616941477 } from '../../db/migrations/1642616941477-addSyncRerunCompatibility';

type MigrationStrategy = 'run' | 'synchronize';

const migrationsTableName = 'migration_table';

interface MigrationsOptions {
  synchronize?: boolean;
  migrationsRun?: boolean;
  migrationsTableName?: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  migrations?: (Function | string)[];
}

const createMigrationsOptions = (): MigrationsOptions => {
  if (!config.has('typeorm.migrationStrategy')) {
    return {};
  }
  const strategy = config.get<MigrationStrategy>('typeorm.migrationStrategy');

  if (strategy === 'synchronize') {
    return { synchronize: true };
  }

  const migrations = [
    initialMigration1621858416252,
    addFileIdConstraintToEntity1623568810719,
    addEntityIndex1635784228947,
    addSyncGeometryType1640244548987,
    addSyncRerunCompatibility1642616941477,
  ];
  return { migrationsRun: true, migrations: migrations, migrationsTableName };
};

export default async (): Promise<void> => {
  const connectionOptionsConfig = config.get<DbConfig>('db');
  const connectionOptions = createConnectionOptions(connectionOptionsConfig);
  await createConnection({ ...connectionOptions, ...createMigrationsOptions() });
};
