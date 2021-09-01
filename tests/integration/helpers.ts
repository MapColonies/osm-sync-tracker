import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { Services } from '../../src/common/constants';
import { RegisterOptions } from '../../src/containerConfig';

export const getBaseRegisterOptions = (): Required<RegisterOptions> => {
  return {
    override: [
      { token: Services.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
      { token: Services.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
    ],
    useChild: true,
  };
};
