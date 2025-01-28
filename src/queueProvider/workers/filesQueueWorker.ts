import IORedis from 'ioredis';
import { Worker, Job, DelayedError } from 'bullmq';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { nanoid } from 'nanoid';
import { ConfigType } from '../../common/config';
import { FILES_QUEUE_NAME, KEY_PREFIX, SYNCS_QUEUE_NAME } from '../constants';
import { SERVICES } from '../../common/constants';
import { ClosureJob, ClosureReturn } from '../types';
import { FILE_CUSTOM_REPOSITORY_SYMBOL, FileRepository } from '../../file/DAL/fileRepository';
import { BullQueueProvider } from '../queues/bullQueueProvider';
import { TransactionFailureError } from '../../common/errors';
import { delayJob, updateJobCounter } from '../helpers';
import { DEFAULT_TRANSACTION_PROPAGATION, transactionify, TransactionName } from '../../common/db/transactions';
import { ExtendedWorkerOptions } from './options';

export const FILES_QUEUE_WORKER_NAME = 'FilesQueueWorker';
export const FILES_QUEUE_WORKER_FACTORY = Symbol(FILES_QUEUE_WORKER_NAME);

export const filesQueueWorkerFactory: FactoryFunction<Worker> = (container) => {
  const queueName = FILES_QUEUE_NAME;
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  const workerLogger = logger.child({ component: FILES_QUEUE_WORKER_NAME });
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const workerOptions = config.get(`closure.queues.${queueName}.workerOptions`) as ExtendedWorkerOptions;
  const redisConnection = container.resolve<IORedis>(SERVICES.REDIS);
  const fileRepository = container.resolve<FileRepository>(FILE_CUSTOM_REPOSITORY_SYMBOL);
  const syncsQueue = container.resolve<BullQueueProvider<ClosureJob>>(SYNCS_QUEUE_NAME);

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
        const [closedIds, closedCount] = await transactionify(
          {
            transactionId: nanoid(),
            transactionName: TransactionName.ATTEMPT_FILE_CLOSURE,
            isolationLevel: transactionIsolationLevel,
            propagation: DEFAULT_TRANSACTION_PROPAGATION,
          },
          async () => fileRepository.attemptFileClosure(id),
          workerLogger
        );

        workerLogger.debug({ msg: 'attempting to close file resulted in', jobId: id, fileId: id, closedIds, closedCount });

        if (closedCount === 0) {
          return { closedCount, closedIds: [], invokedJobCount: 0, invokedJobs: [] };
        }

        // currently maximum of one file is expected to be closed
        const { syncId, fileId } = closedIds[0];
        const syncClosureJob: ClosureJob = { id: syncId, kind: 'sync' };
        await syncsQueue.push([syncClosureJob]);

        return { closedCount, closedIds: [fileId], invokedJobCount: 1, invokedJobs: [syncClosureJob] };
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
      name: FILES_QUEUE_WORKER_NAME,
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
