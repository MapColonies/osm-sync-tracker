import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { SERVICES } from '../../src/common/constants';
import { RegisterOptions } from '../../src/containerConfig';

export const BEFORE_ALL_TIMEOUT = 15000;

export const FLOW_TEST_TIMEOUT = 20000;

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
