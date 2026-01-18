import ioRedis from 'ioredis';
import { injectable, inject } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { ConfigType } from '@src/common/config';
import { SERVICES } from '@src/common/constants';
import { DEFAULT_TRANSACTION_PROPAGATION, transactionify, TransactionName } from '@src/common/db/transactions';
import { FILE_CUSTOM_REPOSITORY_SYMBOL, FileRepository } from '@src/file/DAL/fileRepository';
import { QueueName } from '@src/common/interfaces';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../types';
import { FILES_QUEUE_NAME, SYNCS_QUEUE_NAME, WorkerEnum } from '../constants';
import { JobQueueProvider } from '../interfaces';
import { BullWorkerProvider } from './bullWorkerProvider';
import { ExtendedWorkerOptions } from './options';

@injectable()
export class FilesWorker extends BullWorkerProvider<ClosureJob | BatchClosureJob, ClosureReturn> {
  public constructor(
    @inject(SERVICES.LOGGER) logger: Logger,
    @inject(SERVICES.METRICS) metricsRegistry: Registry,
    @inject(SERVICES.REDIS_WORKER_CONNECTION) connection: ioRedis,
    @inject(SERVICES.CONFIG) config: ConfigType,
    @inject(FILE_CUSTOM_REPOSITORY_SYMBOL) private readonly fileRepository: FileRepository,
    @inject(SYNCS_QUEUE_NAME) private readonly syncsQueue: JobQueueProvider<ClosureJob>
  ) {
    const queueName = FILES_QUEUE_NAME;
    const workerLogger = logger.child({ component: WorkerEnum.FILES });
    const workerOptions = config.get(`closure.queues.${queueName}.workerOptions`) as ExtendedWorkerOptions;
    super({ logger: workerLogger, metricsRegistry, connection, workerOptions });

    this.logger.info({ msg: `initializing ${this.queueName} queue worker`, queueName: this.queueName, workerOptions: this.workerOptions });
  }

  protected getQueueName(): QueueName {
    return FILES_QUEUE_NAME;
  }

  protected async processJob(job: Job<ClosureJob | BatchClosureJob>): Promise<ClosureReturn> {
    const { id } = job.data;

    const [closedIds, closedCount] = await transactionify(
      {
        transactionId: nanoid(),
        transactionName: TransactionName.ATTEMPT_FILE_CLOSURE,
        isolationLevel: this.workerOptions.transactionIsolationLevel,
        propagation: DEFAULT_TRANSACTION_PROPAGATION,
      },
      async () => this.fileRepository.attemptFileClosure(id),
      this.logger
    );

    this.logger.debug({ msg: 'attempting to close file resulted in', jobId: id, fileId: id, closedIds, closedCount });

    if (closedCount === 0) {
      return { closedCount, closedIds: [], invokedJobCount: 0, invokedJobs: [] };
    }

    // currently maximum of one file is expected to be closed
    const { syncId, fileId } = closedIds[0];
    const syncClosureJob: ClosureJob = { id: syncId, kind: 'sync' };
    await this.syncsQueue.push([syncClosureJob]);

    return { closedCount, closedIds: [fileId], invokedJobCount: 1, invokedJobs: [syncClosureJob] };
  }
}
