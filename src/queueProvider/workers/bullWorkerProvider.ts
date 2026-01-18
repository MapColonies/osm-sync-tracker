import { Counter, Histogram, Registry } from 'prom-client';
import { DelayedError, Job, Worker } from 'bullmq';
import ioRedis from 'ioredis';
import { ILogger, QueueName } from '@src/common/interfaces';
import { snakeCase } from 'lodash';
import { MS_IN_SECOND } from '@src/common/constants';
import { randomIntFromInterval } from '@src/common/utils';
import { TransactionFailureError } from '@src/common/errors';
import { bullMqOtelFactory } from '../telemetry';
import { QUEUE_KEY_PREFIX } from '../constants';
import { delayJob, updateJobCounter } from '../helpers';
import { Identifiable } from '../interfaces';
import { ExtendedWorkerOptions, WorkerProducerOptions } from './options';

export abstract class BullWorkerProvider<DataType extends Identifiable = Identifiable, ReturnType = unknown> {
  protected readonly logger: ILogger;
  protected readonly metricsRegistry: Registry | undefined;
  protected readonly workerOptions: ExtendedWorkerOptions;
  private readonly connection: ioRedis;
  private worker: Worker<DataType, ReturnType> | undefined;

  private readonly jobCounter?: Counter<'status'>;
  private readonly internalErrorCounter?: Counter;
  private readonly porcessingHistogram?: Histogram;

  public constructor(options: WorkerProducerOptions) {
    const { logger, metricsRegistry, connection, workerOptions } = options;
    this.logger = logger;
    this.metricsRegistry = metricsRegistry;
    this.workerOptions = workerOptions;
    this.connection = connection;

    if (this.metricsRegistry !== undefined) {
      this.porcessingHistogram = new Histogram({
        name: `osm_sync_tracker_${snakeCase(this.queueName)}_job_processing_duration_seconds`,
        help: 'Osm-sync-tracker processing duration',
        registers: [this.metricsRegistry],
      });

      this.jobCounter = new Counter({
        name: `osm_sync_tracker_${snakeCase(this.queueName)}_job_count`,
        help: 'Osm-sync-tracker job processing counter by resulted event',
        labelNames: ['status'] as const,
        registers: [this.metricsRegistry],
      });

      this.internalErrorCounter = new Counter({
        name: `osm_sync_tracker_${snakeCase(this.queueName)}_internal_error_total`,
        help: 'The total number of internal errors occured while job processing',
        registers: [this.metricsRegistry],
      });
    }
  }

  public get queueName(): QueueName {
    return this.getQueueName();
  }

  public async start(): Promise<void> {
    if (!this.worker) {
      this.createWorker();
    }

    try {
      await this.worker?.run();
      this.logger.info({ msg: 'worker started consuming successfully', queueName: this.queueName });
    } catch (err) {
      this.logger.error({ msg: 'failed to start worker', queueName: this.queueName, err });
      throw err;
    }
  }

  public async close(): Promise<void> {
    if (!this.worker) {
      return;
    }

    try {
      await this.worker.close();
      this.logger.info({ msg: `worker closed gracefully`, queueName: this.queueName });
    } catch (err) {
      this.logger.error({ msg: `failed closing worker`, queueName: this.queueName, err });
      throw err;
    } finally {
      this.worker = undefined;
    }
  }

  protected async processJobWrapper(job: Job<DataType, ReturnType>): Promise<ReturnType> {
    const { id } = job.data;

    const baseLoggedObject = {
      queueName: this.queueName,
      jobId: id,
      jobData: job.data,
      attemptsMade: job.attemptsMade,
      attemptsMax: job.opts.attempts,
      jobOptions: job.opts,
      workerOptions: this.workerOptions,
    };

    this.logger.debug({ msg: 'started job processing', ...baseLoggedObject });

    try {
      return await this.processJob(job);
    } catch (error) {
      this.logger.error({
        msg: "worker's job consuming errored",
        ...baseLoggedObject,
        err: error,
      });

      const delay = randomIntFromInterval(this.workerOptions.transactionFailureDelay.minimum, this.workerOptions.transactionFailureDelay.maximum);

      if (error instanceof TransactionFailureError) {
        this.logger.info({
          msg: 'delaying job due to transaction failure',
          ...baseLoggedObject,
          delay,
        });

        await updateJobCounter(job, 'transactionFailure');

        await delayJob(job, delay);

        this.jobCounter?.inc({ status: 'transactionFailure' });

        throw new DelayedError();
      }

      throw error;
    }
  }

  private createWorker(): void {
    const workerConstructorOptions = {
      ...this.workerOptions,
      connection: this.connection,
      prefix: QUEUE_KEY_PREFIX,
      autorun: false,
      telemetry: bullMqOtelFactory(),
    };

    this.worker = new Worker(this.queueName, this.processJobWrapper.bind(this), workerConstructorOptions);

    this.setupEventListenerts();
  }

  private setupEventListenerts(): void {
    this.worker?.on('completed', (job) => {
      const { id, name, finishedOn, processedOn } = job;
      this.logger.debug({ msg: `job completed`, queueName: this.queueName, jobId: id, jobName: name });

      this.jobCounter?.inc({ status: 'completed' });

      if (finishedOn !== undefined && processedOn !== undefined) {
        const duration = (finishedOn - processedOn) / MS_IN_SECOND;
        this.porcessingHistogram?.observe(duration);
      }
    });

    this.worker?.on('failed', (job, err) => {
      const attempts = job?.opts.attempts;
      const attemptsMade = job?.attemptsMade;

      this.logger.error({ msg: `job failed`, queueName: this.queueName, jobId: job?.id, jobName: job?.name, err, attempts, attemptsMade });

      if (attempts !== undefined && attemptsMade !== undefined && attempts > attemptsMade) {
        this.jobCounter?.inc({ status: 'retry' });
      } else {
        this.jobCounter?.inc({ status: 'failed' });
      }
    });

    this.worker?.on('stalled', (jobId) => {
      this.logger.warn({ msg: 'job stalled', queueName: this.queueName, jobId });
      this.jobCounter?.inc({ status: 'stalled' });
    });

    this.worker?.on('error', (err) => {
      this.logger.error({ msg: 'worker internal error occured', queueName: this.queueName, err });
      this.internalErrorCounter?.inc();
    });
  }

  protected abstract processJob(job: Job<DataType, ReturnType>): Promise<ReturnType>;

  protected abstract getQueueName(): QueueName;
}
