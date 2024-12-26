import { Worker, Job, DelayedError } from 'bullmq';
import { FactoryFunction } from 'tsyringe';
import IORedis from 'ioredis';
import { BullMQOtel } from 'bullmq-otel';
import { Logger } from '@map-colonies/js-logger';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { nanoid } from 'nanoid';
import { CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME } from '../constants';
import { SERVICES } from '../../common/constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../types';
import { IConfig } from '../../common/interfaces';
import { ENTITY_CUSTOM_REPOSITORY_SYMBOL, EntityRepository } from '../../entity/DAL/entityRepository';
import { Status } from '../../common/enums';
import { JobQueueProvider } from '../interfaces';
import { TransactionFailureError } from '../../common/errors';
import { delayJob } from '../helpers';
import { TransactionName } from '../../common/db/transactions';
import { ExtendedWorkerOptions } from './options';

export const CHANGESETS_QUEUE_WORKER_NAME = 'ChangesetsQueueWorker';
export const CHANGESETS_QUEUE_WORKER_FACTORY = Symbol(CHANGESETS_QUEUE_WORKER_NAME);

export const changesetsQueueWorkerFactory: FactoryFunction<Worker> = (container) => {
  const queueName = CHANGESETS_QUEUE_NAME;
  const logger = container.resolve<Logger>(SERVICES.LOGGER);
  const workerLogger = logger.child({ component: CHANGESETS_QUEUE_WORKER_NAME });
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const workerOptions = config.get<ExtendedWorkerOptions>(`closure.queues.${queueName}.workerOptions`);
  const redisConnection = container.resolve<IORedis>(SERVICES.REDIS);
  const entityRepository = container.resolve<EntityRepository>(ENTITY_CUSTOM_REPOSITORY_SYMBOL);
  const filesQueue = container.resolve<JobQueueProvider<ClosureJob>>(FILES_QUEUE_NAME);
  const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);

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

      workerLogger.debug({ msg: 'started job processing', ...baseLoggedObject });

      try {
        const isBatch = Array.isArray(batchIds) && batchIds.every((id) => typeof id === 'string');
        const changesetIds = isBatch ? (batchIds as string[]) : [id];
        const fileIds = await entityRepository.transactionify(
          { transactionId: nanoid(), transactionName: TransactionName.FIND_FILES_BY_CHANGESETS, isolationLevel: transactionIsolationLevel },
          async () => {
            return entityRepository.findFilesByChangesets(changesetIds, [Status.IN_PROGRESS]);
          }
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

          await delayJob(job, transactionFailureDelay);

          throw new DelayedError();
        }

        throw error;
      }
    },
    {
      ...workerOptions,
      name: CHANGESETS_QUEUE_WORKER_NAME,
      connection: redisConnection,
      telemetry: new BullMQOtel('temp'),
      autorun: false,
    }
  );

  cleanupRegistry.register({ id: CHANGESETS_QUEUE_WORKER_NAME, func: worker.close.bind(worker) });

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
