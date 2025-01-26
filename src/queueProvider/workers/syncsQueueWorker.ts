import { Worker, Job, DelayedError } from 'bullmq';
import { FactoryFunction } from 'tsyringe';
import IORedis from 'ioredis';
import { Logger } from '@map-colonies/js-logger';
import { nanoid } from 'nanoid';
import { ConfigType } from '../../common/config';
import { KEY_PREFIX, SYNCS_QUEUE_NAME } from '../constants';
import { SERVICES } from '../../common/constants';
import { TransactionFailureError } from '../../common/errors';
import { ClosureJob, ClosureReturn } from '../types';
import { SYNC_CUSTOM_REPOSITORY_SYMBOL, SyncRepository } from '../../sync/DAL/syncRepository';
import { delayJob, updateJobCounter } from '../helpers';
import { TransactionName } from '../../common/db/transactions';
import { ExtendedWorkerOptions } from './options';

export const SYNCS_QUEUE_WORKER_NAME = 'SyncsQueueWorker';
export const SYNCS_QUEUE_WORKER_FACTORY = Symbol(SYNCS_QUEUE_WORKER_NAME);

export const syncsQueueWorkerFactory: FactoryFunction<Worker> = (container) => {
  const queueName = SYNCS_QUEUE_NAME;
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  const workerLogger = logger.child({ component: SYNCS_QUEUE_WORKER_NAME });
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const workerOptions = config.get(`closure.queues.${queueName}.workerOptions`) as ExtendedWorkerOptions;
  const redisConnection = container.resolve<IORedis>(SERVICES.REDIS);
  const syncRepository = container.resolve<SyncRepository>(SYNC_CUSTOM_REPOSITORY_SYMBOL);

  workerLogger.info({ msg: `initializing ${queueName} queue worker`, workerOptions });

  const { transactionIsolationLevel, transactionFailureDelay } = workerOptions;

  const worker = new Worker(
    queueName,
    async (job: Job<ClosureJob, ClosureReturn>) => {
      const { id } = job.data;

      const baseLoggedObject = {
        queueName,
        jobId: id,
        jobData: job.data,
        attemptsMade: job.attemptsMade,
        attemptsMax: job.opts.attempts,
        jobOptions: job.opts,
        workerOptions,
      };

      workerLogger.debug({ msg: 'started job processing', ...baseLoggedObject });

      try {
        const [closedIds, closedCount] = await syncRepository.transactionify(
          { transactionId: nanoid(), transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE, isolationLevel: transactionIsolationLevel },
          async () => syncRepository.attemptSyncClosure(id)
        );

        workerLogger.debug({ msg: 'attempting to close sync resulted in', jobId: id, syncId: id, closedIds, closedCount });

        const closedSyncAndRerunIds = closedIds.map((closedSync) => closedSync.id);

        return { closedCount, closedIds: closedSyncAndRerunIds, invokedJobCount: 0, invokedJobs: [] };
      } catch (error) {
        workerLogger.error({
          msg: "worker's job consuming errored",
          ...baseLoggedObject,
          err: error,
        });

        if (error instanceof TransactionFailureError) {
          workerLogger.info({
            msg: 'delaying job due to transaction failure',
            ...baseLoggedObject,
            transactionIsolationLevel,
            transactionFailureDelay,
          });

          await updateJobCounter(job, 'transactionFailure');

          await delayJob(job, transactionFailureDelay);

          throw new DelayedError();
        }

        throw error;
      }
    },
    {
      ...workerOptions,
      name: SYNCS_QUEUE_WORKER_NAME,
      prefix: KEY_PREFIX,
      connection: redisConnection,
      autorun: false,
    }
  );

  worker.on('completed', (job) => {
    workerLogger.info({ msg: `Job ${job.id ?? 'unknown_id'} in Queue ${queueName} completed`, queueName });
  });

  worker.on('failed', (job, err) => {
    workerLogger.error({ msg: `Job ${job?.id ?? 'unknown_id'} in Queue ${queueName} failed:`, queueName, err });
  });

  worker.on('error', (err) => {
    workerLogger.error({ msg: 'worker error occured', queueName, err });
  });

  return worker;
};
