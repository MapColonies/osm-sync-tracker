import { Worker, Job, DelayedError } from 'bullmq';
import { FactoryFunction } from 'tsyringe';
import IORedis from 'ioredis';
import { Logger } from '@map-colonies/js-logger';
import { nanoid } from 'nanoid';
import { ConfigType } from '../../common/config';
import { CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, JOB_STALLED_FAILURE_ERROR_MESSAGE, KEY_PREFIX } from '../constants';
import { SERVICES } from '../../common/constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../types';
import { ENTITY_CUSTOM_REPOSITORY_SYMBOL, EntityRepository } from '../../entity/DAL/entityRepository';
import { Status } from '../../common/enums';
import { JobQueueProvider } from '../interfaces';
import { TransactionFailureError } from '../../common/errors';
import { delayJob, incrementJobCounter, updateJobCounter } from '../helpers';
import { DEFAULT_TRANSACTION_PROPAGATION, transactionify, TransactionName } from '../../common/db/transactions';
import { ExtendedWorkerOptions } from './options';

export const CHANGESETS_QUEUE_WORKER_NAME = 'ChangesetsQueueWorker';
export const CHANGESETS_QUEUE_WORKER_FACTORY = Symbol(CHANGESETS_QUEUE_WORKER_NAME);

export const changesetsQueueWorkerFactory: FactoryFunction<Worker> = (container) => {
  const queueName = CHANGESETS_QUEUE_NAME;
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  const workerLogger = logger.child({ component: CHANGESETS_QUEUE_WORKER_NAME });
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const workerOptions = config.get(`closure.queues.${queueName}.workerOptions`) as ExtendedWorkerOptions;
  const redisConnection = container.resolve<IORedis>(SERVICES.REDIS);
  const entityRepository = container.resolve<EntityRepository>(ENTITY_CUSTOM_REPOSITORY_SYMBOL);
  const changesetsQueue = container.resolve<JobQueueProvider<ClosureJob>>(CHANGESETS_QUEUE_NAME);
  const filesQueue = container.resolve<JobQueueProvider<ClosureJob>>(FILES_QUEUE_NAME);

  workerLogger.info({ msg: `initializing ${queueName} queue worker`, workerOptions: workerOptions });

  const { transactionIsolationLevel, transactionFailureDelay } = workerOptions;

  const worker = new Worker(
    queueName,
    async (job: Job<ClosureJob | BatchClosureJob, ClosureReturn>) => {
      const { id, batchIds } = job.data;

      const baseLoggedObject = {
        queueName,
        jobId: id,
        jobData: job.data,
        attemptsMade: job.attemptsMade,
        attemptsMax: job.opts.attempts,
        jobOptions: job.opts,
        workerOptions,
      };

      try {
        const isBatch = Array.isArray(batchIds) && batchIds.every((id) => typeof id === 'string');
        const changesetIds = isBatch ? batchIds : [id];

        const fileIds = await transactionify(
          {
            transactionId: nanoid(),
            transactionName: TransactionName.FIND_FILES_BY_CHANGESETS,
            isolationLevel: transactionIsolationLevel,
            propagation: DEFAULT_TRANSACTION_PROPAGATION,
          },
          async () => entityRepository.findFilesByChangesets(changesetIds, [Status.IN_PROGRESS]),
          workerLogger
        );

        workerLogger.info({ msg: 'found the following files in the changeset', jobId: id, fileIds });

        if (fileIds.length === 0) {
          return { invokedJobCount: 0, invokedJobs: [] };
        }

        const fileClosureJobs: ClosureJob[] = fileIds.map((fileId) => ({ id: fileId.fileId, kind: 'file' }));

        await filesQueue.push(fileClosureJobs);

        return { invokedJobCount: fileClosureJobs.length, invokedJobs: fileClosureJobs };
      } catch (error) {
        workerLogger.error({
          msg: "worker's job processing errored",
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
      name: CHANGESETS_QUEUE_WORKER_NAME,
      prefix: KEY_PREFIX,
      connection: redisConnection,
      autorun: false,
    }
  );

  worker.on('completed', (job) => {
    workerLogger.info({ msg: `Job ${job.id ?? 'unknown_id'} in Queue ${queueName} completed`, queueName });
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  worker.on('failed', async (job, err) => {
    workerLogger.error({ msg: `Job ${job?.id ?? 'unknown_id'} in Queue ${queueName} failed`, queueName, err });

    if (job !== undefined && err.message === JOB_STALLED_FAILURE_ERROR_MESSAGE) {
      const incremented = incrementJobCounter(job.data, 'stalledFailure');
      await changesetsQueue.push([incremented]);
    }
  });

  worker.on('error', (err) => {
    workerLogger.error({ msg: 'worker error occured', queueName, err });
  });

  return worker;
};
