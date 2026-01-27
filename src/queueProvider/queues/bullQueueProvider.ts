import { injectable } from 'tsyringe';
import { Queue, QueueEvents } from 'bullmq';
import { Counter, Gauge, Registry } from 'prom-client';
import { snakeCase } from 'lodash';
import { Identifiable, JobQueueProvider } from '../interfaces';
import { ILogger } from '../../common/interfaces';
import { hashBatch } from '../../common/utils';
import { JOB_STATES } from '../constants';
import { updateJobCounter } from '../helpers';
import { ExtendedJobOptions, QueueConfig, QueueOptions } from './options';

@injectable()
export class BullQueueProvider<T extends Identifiable = Identifiable> implements JobQueueProvider<T> {
  private readonly queue: Queue<T, unknown, string, T, unknown, string>;
  private readonly queueName: string;
  private readonly queueEvents: QueueEvents | undefined;
  private readonly queueOptions: QueueOptions;
  private readonly jobOptions: ExtendedJobOptions;
  private readonly logger: ILogger | undefined;
  private readonly metricsRegistry?: Registry;
  private readonly addedCounter?: Counter<'kind'>;

  public constructor(options: QueueConfig) {
    const { queue, queueName, queueEvents, queueOptions, jobOptions, logger, metricsRegistry } = options;
    this.queue = queue as Queue<T, unknown, string, T, unknown, string>;
    this.queueName = queueName;
    this.queueEvents = queueEvents;
    this.queueOptions = queueOptions;
    this.jobOptions = jobOptions;
    this.logger = logger;
    this.metricsRegistry = metricsRegistry;

    this.logger?.info({ msg: 'initializing queue', queueName, queueOptions, jobOptions, enabledQueueEvents: queueEvents !== undefined });

    this.queueEvents?.on('deduplicated', async ({ jobId }) => {
      await this.changeJobDelay(jobId, this.jobOptions.deduplicationDelay as number);
    });

    if (this.metricsRegistry !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      new Gauge({
        name: `osm_sync_tracker_${snakeCase(this.queueName)}_state_counts`,
        help: 'The number of current jobs in different states in the queue',
        labelNames: ['state'] as const,
        async collect(): Promise<void> {
          const statesCount = await self.queue.getJobCounts(...JOB_STATES);
          JOB_STATES.forEach((jobState) => this.set({ state: jobState }, statesCount[jobState]));
        },
        registers: [this.metricsRegistry],
      });

      this.addedCounter = new Counter({
        name: `osm_sync_tracker_${snakeCase(this.queueName)}_added`,
        help: 'The number of added jobs by kind of addition',
        labelNames: ['kind'] as const,
        registers: [this.metricsRegistry],
      });
    }
  }

  public get activeQueueName(): string {
    return this.queueName;
  }

  public async close(): Promise<void> {
    await this.queue.close();
    await this.queueEvents?.close();
  }

  public async push(jobs: T[]): Promise<void> {
    // a single job will simply be added to the queue
    if (jobs.length === 1) {
      await this.addJob(jobs[0]);
      return;
    }

    // if batching is disabled add a bulk of jobs without batching
    if (!this.queueOptions.enabledBatchJobs) {
      await this.addBulk(jobs);
      return;
    }

    // batching is enabled and jobs has multiple job items in it
    const bulk: T[] = [];

    const maxBatchSize = this.queueOptions.maxBatchSize as number;

    for (let i = 0; i < jobs.length; i += maxBatchSize) {
      const batchIds = jobs.slice(i, i + maxBatchSize).map((job) => job.id);

      const batchId = hashBatch(batchIds);

      const batchJob = { ...jobs[0], id: batchId, batchIds };

      bulk.push(batchJob as unknown as T);
    }

    await this.addBulk(bulk);
  }

  public async changeJobDelay(jobId: string, delay: number): Promise<void> {
    try {
      this.logger?.info({ msg: 'attempting to change job delay', queueName: this.queueName, jobId, delay });

      const job = await this.queue.getJob(jobId);

      if (job === undefined) {
        return;
      }

      try {
        const isDelayed = await job.isDelayed();

        if (!isDelayed) {
          throw new Error('job is no longer in delayed state.');
        }

        await job.changeDelay(delay);
      } catch (err) {
        this.logger?.error({
          msg: 'an error occurred during job delay change. attempting to add the job newly',
          queueName: this.queueName,
          jobId,
          delay,
          err,
        });

        await this.addJob(job.data as T);

        return;
      }

      await updateJobCounter(job, 'deduplication');
    } catch (err) {
      this.logger?.error({ msg: 'an error accord during job delay change', queueName: this.queueName, jobId, delay, err });
    }
  }

  private async addJob(job: T): Promise<void> {
    this.logger?.info({ msg: 'adding single job to queue', queueName: this.queueName, jobId: job.id, job, jobOptions: this.jobOptions });

    await this.queue.add(job.id, job, { ...this.jobOptions, deduplication: { id: job.id, ttl: this.jobOptions.deduplicationTtl } });

    this.addedCounter?.inc({ kind: 'single' });
    this.addedCounter?.inc({ kind: 'total' });
  }

  private async addBulk(bulk: T[]): Promise<void> {
    const jobIds = bulk.map((job) => job.id);
    this.logger?.info({ msg: 'adding bulk of jobs to queue', queueName: this.queueName, jobIds: jobIds, jobOptions: this.jobOptions });

    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    const jobBulk: Parameters<typeof this.queue.addBulk>[0] = bulk.map((job) => ({
      name: job.id,
      data: job,
      opts: { ...this.jobOptions, deduplication: { id: job.id, ttl: this.jobOptions.deduplicationTtl } },
    }));

    await this.queue.addBulk(jobBulk);

    this.addedCounter?.inc({ kind: 'bulk' });
    this.addedCounter?.inc({ kind: 'total' }, bulk.length);
  }
}
