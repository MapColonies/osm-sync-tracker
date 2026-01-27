import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { ConfigType } from '@src/common/config';
import { SERVICES } from '@src/common/constants';
import { DEFAULT_TRANSACTION_PROPAGATION, transactionify, TransactionName } from '@src/common/db/transactions';
import { QueueName } from '@src/common/interfaces';
import { Status } from '@src/common/enums';
import { ENTITY_CUSTOM_REPOSITORY_SYMBOL, EntityRepository } from '@src/entity/DAL/entityRepository';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../types';
import { CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, WorkerEnum } from '../constants';
import { JobQueueProvider } from '../interfaces';
import { BullWorkerProvider } from './bullWorkerProvider';
import { ExtendedWorkerOptions } from './options';

@injectable()
export class ChangesetsWorker extends BullWorkerProvider<ClosureJob | BatchClosureJob, ClosureReturn> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.REDIS_WORKER_CONNECTION) connection: ioRedis,
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(ENTITY_CUSTOM_REPOSITORY_SYMBOL) private readonly entityRepository: EntityRepository,
    @inject(FILES_QUEUE_NAME) private readonly filesQueue: JobQueueProvider<ClosureJob>
  ) {
    const workerLogger = logger.child({ component: WorkerEnum.CHANGESETS });
    const keyPrefix = config.get(`closure.keyPrefix`);
    const workerOptions = config.get(`closure.queues.${CHANGESETS_QUEUE_NAME}.workerOptions`) as ExtendedWorkerOptions;
    super({ logger: workerLogger, metricsRegistry, connection, workerOptions: { ...workerOptions, prefix: keyPrefix } });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueName {
    return CHANGESETS_QUEUE_NAME;
  }

  protected async processJob(job: Job<ClosureJob | BatchClosureJob>): Promise<ClosureReturn> {
    const { id, batchIds } = job.data;

    const isBatch = Array.isArray(batchIds) && batchIds.every((id) => typeof id === 'string');
    const changesetIds = isBatch ? batchIds : [id];

    const fileIds = await transactionify(
      {
        transactionId: nanoid(),
        transactionName: TransactionName.FIND_FILES_BY_CHANGESETS,
        isolationLevel: this.workerOptions.transactionIsolationLevel,
        propagation: DEFAULT_TRANSACTION_PROPAGATION,
      },
      async () => this.entityRepository.findFilesByChangesets(changesetIds, [Status.IN_PROGRESS]),
      this.logger
    );

    this.logger.info({ msg: 'found the following files in the changeset', jobId: id, fileIds });

    if (fileIds.length === 0) {
      return { invokedJobCount: 0, invokedJobs: [] };
    }

    const fileClosureJobs: ClosureJob[] = fileIds.map((fileId) => ({ id: fileId.fileId, kind: 'file' }));

    await this.filesQueue.push(fileClosureJobs);

    return { invokedJobCount: fileClosureJobs.length, invokedJobs: fileClosureJobs };
  }
}
