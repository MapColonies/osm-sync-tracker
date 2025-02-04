// this import must be called before the first import of tsyringe
import 'reflect-metadata';
import './common/tracing';
import { createServer } from 'http';
import { DependencyContainer } from 'tsyringe';
import { createTerminus } from '@godaddy/terminus';
import { Logger } from '@map-colonies/js-logger';
import { HEALTHCHECK, ON_SIGNAL, SERVICES } from './common/constants';
import { getApp } from './app';
import { ConfigType } from './common/config';
import { CLOSURE_WORKERS_INITIALIZER } from './queueProvider/constants';

let depContainer: DependencyContainer | undefined;

void getApp()
  .then(async ({ app, container }) => {
    depContainer = container;

    const logger = depContainer.resolve<Logger>(SERVICES.LOGGER);
    const config = depContainer.resolve<ConfigType>(SERVICES.CONFIG);
    const port = config.get('server.port');

    const server = createTerminus(createServer(app), {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      healthChecks: { '/liveness': depContainer.resolve(HEALTHCHECK) },
      onSignal: depContainer.resolve(ON_SIGNAL),
    });

    server.listen(port, () => {
      logger.info(`app started on port ${port}`);
    });

    const closureWokrersInit = depContainer.resolve<() => Promise<void>>(CLOSURE_WORKERS_INITIALIZER);
    await closureWokrersInit();
  })
  .catch(async (error: Error) => {
    const errorLogger =
      depContainer?.isRegistered(SERVICES.LOGGER) == true
        ? depContainer.resolve<Logger>(SERVICES.LOGGER).error.bind(depContainer.resolve<Logger>(SERVICES.LOGGER))
        : console.error;
    errorLogger({ msg: '😢 - failed initializing the server', err: error });

    if (depContainer?.isRegistered(ON_SIGNAL) == true) {
      const shutDown: () => Promise<void> = depContainer.resolve(ON_SIGNAL);
      await shutDown();
    }
    process.exit(1);
  });
