/* eslint-disable import/first */
// this import must be called before the first import of tsyring
import 'reflect-metadata';
import './common/tracing';
import { createServer } from 'http';
import { DependencyContainer } from 'tsyringe';
import { createTerminus } from '@godaddy/terminus';
import { Logger } from '@map-colonies/js-logger';
import config from 'config';
import { Worker } from 'bullmq';
import { DEFAULT_SERVER_PORT, HEALTHCHECK, ON_SIGNAL, SERVICES } from './common/constants';
import { getApp } from './app';
import { FILES_QUEUE_WORKER_FACTORY } from './queueProvider/workers/filesQueueWorker';
import { CHANGESETS_QUEUE_WORKER_FACTORY } from './queueProvider/workers/changesetsQueueWorker';
import { SYNCS_QUEUE_WORKER_FACTORY } from './queueProvider/workers/syncsQueueWorker';

let depContainer: DependencyContainer | undefined;

const port: number = config.get<number>('server.port') || DEFAULT_SERVER_PORT;

void getApp()
  .then(async ({ app, container }) => {
    depContainer = container;

    const logger = container.resolve<Logger>(SERVICES.LOGGER);
    const server = createTerminus(createServer(app), {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      healthChecks: { '/liveness': container.resolve(HEALTHCHECK) },
      onSignal: container.resolve(ON_SIGNAL),
    });

    server.listen(port, () => {
      logger.info(`app started on port ${port}`);
    });

    const changesetWorker = container.resolve<Worker>(CHANGESETS_QUEUE_WORKER_FACTORY);
    const fileWorker = container.resolve<Worker>(FILES_QUEUE_WORKER_FACTORY);
    const syncWorker = container.resolve<Worker>(SYNCS_QUEUE_WORKER_FACTORY);
    await Promise.all([changesetWorker.run(), fileWorker.run(), syncWorker.run()]);
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
  });
