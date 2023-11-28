import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { DataSource } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { Changeset } from '../../src/changeset/DAL/changeset';
import { SERVICES } from '../../src/common/constants';
import { RegisterOptions } from '../../src/containerConfig';
import { SyncDb } from '../../src/sync/DAL/sync';

export const BEFORE_ALL_TIMEOUT = 15000;

export const LONG_RUNNING_TEST_TIMEOUT = 20000;

export const RERUN_TEST_TIMEOUT = 60000;

export const DEFAULT_ISOLATION_LEVEL: IsolationLevel = 'SERIALIZABLE';

export const getBaseRegisterOptions = (): Required<RegisterOptions> => {
  return {
    override: [
      { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
      { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
    ],
    useChild: true,
  };
};

export const clearRepositories = async (connection: DataSource): Promise<void> => {
  await Promise.all([SyncDb, Changeset].map(async (entity) => connection.getRepository(entity).delete({})));
};
