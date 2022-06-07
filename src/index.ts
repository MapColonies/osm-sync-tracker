/* eslint-disable import/first */
// this import must be called before the first import of tsyring
import 'reflect-metadata';
import { createServer } from 'http';
import { DependencyContainer } from 'tsyringe';
import { createTerminus } from '@godaddy/terminus';
import { Logger } from '@map-colonies/js-logger';
import config from 'config';
import { DEFAULT_SERVER_PORT, HEALTHCHECK, ON_SIGNAL, SERVICES } from './common/constants';
import { getApp } from './app';
import { IServerConfig } from './common/interfaces';

const serverConfig = config.get<IServerConfig>('server');
const port: number = parseInt(serverConfig.port) || DEFAULT_SERVER_PORT;
let depContainer: DependencyContainer | undefined;

void getApp()
  .then(({ app, container }) => {
    const logger = container.resolve<Logger>(SERVICES.LOGGER);
    depContainer = container;
    const server = createTerminus(createServer(app), {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      healthChecks: { '/liveness': container.resolve(HEALTHCHECK) },
      onSignal: container.resolve(ON_SIGNAL),
    });

    server.listen(port, () => {
      logger.info(`app started on port ${port}`);
    });
  })
  .catch(async (error: Error) => {
    console.error('😢 - failed initializing the server');
    console.error(error.message);
    if (!depContainer || !depContainer.isRegistered(ON_SIGNAL)) {
      return;
    }
    const shutDown: () => Promise<void> = depContainer.resolve(ON_SIGNAL);
    await shutDown();
  });
