import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { ConfigType } from '@src/common/config';
import { SERVICES } from '@src/common/constants';
import { DEFAULT_TRANSACTION_PROPAGATION, transactionify, TransactionName } from '@src/common/db/transactions';
import { SYNC_CUSTOM_REPOSITORY_SYMBOL, SyncRepository } from '@src/sync/DAL/syncRepository';
import { QueueName } from '@src/common/interfaces';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../types';
import { SYNCS_QUEUE_NAME, WorkerEnum } from '../constants';
import { BullWorkerProvider } from './bullWorkerProvider';
import { ExtendedWorkerOptions } from './options';

@injectable()
export class SyncsWorker extends BullWorkerProvider<ClosureJob | BatchClosureJob, ClosureReturn> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.REDIS_WORKER_CONNECTION) connection: ioRedis,
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(SYNC_CUSTOM_REPOSITORY_SYMBOL) private readonly syncRepository: SyncRepository
  ) {
    const queueName = SYNCS_QUEUE_NAME;
    const workerLogger = logger.child({ component: WorkerEnum.SYNCS });
    const workerOptions = config.get(`closure.queues.${queueName}.workerOptions`) as ExtendedWorkerOptions;
    super({ logger: workerLogger, metricsRegistry, connection, workerOptions });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueName {
    return SYNCS_QUEUE_NAME;
  }

  protected async processJob(job: Job<ClosureJob | BatchClosureJob>): Promise<ClosureReturn> {
    const { id } = job.data;

    const [closedIds, closedCount] = await transactionify(
      {
        transactionId: nanoid(),
        transactionName: TransactionName.ATTEMPT_SYNC_CLOSURE,
        isolationLevel: this.workerOptions.transactionIsolationLevel,
        propagation: DEFAULT_TRANSACTION_PROPAGATION,
      },
      async () => this.syncRepository.attemptSyncClosure(id),
      this.logger
    );

    this.logger.debug({ msg: 'attempting to close sync resulted in', jobId: id, syncId: id, closedIds, closedCount });

    const closedSyncAndRerunIds = closedIds.map((closedSync) => closedSync.id);

    return { closedCount, closedIds: closedSyncAndRerunIds, invokedJobCount: 0, invokedJobs: [] };
  }
}
