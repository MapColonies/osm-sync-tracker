import { injectable } from 'tsyringe';
import { Queue, QueueEvents } from 'bullmq';
import { BullMQOtel } from 'bullmq-otel';
import { Identifiable, JobQueueProvider } from '../interfaces';
import { ILogger } from '../../common/interfaces';
import { hashList } from '../../common/utils';
import { ExtendedJobOptions, QueueConfig, QueueOptions } from './options';

@injectable()
export class BullQueueProvider<T extends Identifiable> implements JobQueueProvider<T> {
  private readonly queue: Queue<T, unknown, string, T, unknown, string>;
  private readonly queueName: string;
  private readonly queueEvents: QueueEvents | undefined;
  private readonly queueOptions: QueueOptions;
  private readonly jobOptions: ExtendedJobOptions;
  private readonly logger: ILogger | undefined;

  public constructor(options: QueueConfig) {
    const { queueName, queueEvents, queueOptions, jobOptions, connection: connection, logger } = options;
    this.queueName = queueName;
    this.queueEvents = queueEvents;
    this.queueOptions = queueOptions;
    this.jobOptions = jobOptions;
    this.logger = logger;

    this.logger?.info({ msg: 'initializing queue', queueName, queueOptions, jobOptions, enabledQueueEvents: queueEvents !== undefined });

    this.queue = new Queue<T, unknown, string, T, unknown, string>(this.queueName, {
      connection,
      telemetry: new BullMQOtel('temp'),
    });

    this.queueEvents?.on('deduplicated', async ({ jobId, deduplicationId }) => {
      this.logger?.info({ msg: 'deduplicated detected, changing delay', queueName, jobId, deduplicationId });

      await this.changeJobDelay(jobId, this.jobOptions.deduplicationDelay as number);
    });
  }

  public get activeQueueName(): string {
    return this.queueName;
  }

  public async shutdown(): Promise<void> {
    await this.queue.close();
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

      const id = hashList(batchIds);

      const batchJob = { ...jobs[0], id, batchIds };

      bulk.push(batchJob as unknown as T);
    }

    await this.addBulk(bulk);
  }

  private async addJob(job: T): Promise<void> {
    this.logger?.info({ msg: 'adding single job to queue', queueName: this.queueName, jobId: job.id, job, jobOptions: this.jobOptions });

    await this.queue.add(job.id, job, { ...this.jobOptions, deduplication: { id: job.id } });
  }

  private async addBulk(bulk: T[]): Promise<void> {
    const jobIds = bulk.map((job) => job.id);
    this.logger?.info({ msg: 'adding bulk of jobs to queue', queueName: this.queueName, jobIds: jobIds, jobOptions: this.jobOptions });

    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    const jobBulk: Parameters<typeof this.queue.addBulk>[0] = bulk.map((job) => ({
      name: job.id,
      data: job,
      opts: { ...this.jobOptions, deduplication: { id: job.id } },
    }));

    await this.queue.addBulk(jobBulk);
  }

  private async changeJobDelay(jobId: string, delay: number): Promise<void> {
    try {
      this.logger?.info({ msg: 'attempting to change job delay', queueName: this.queueName, jobId, delay });

      const job = await this.queue.getJob(jobId);

      if (job === undefined) {
        return;
      }

      await job.changeDelay(delay);

      const previousDeduplicationCount = (job.data.deduplicationCount as number | undefined) ?? 0;
      await job.updateData({ ...job.data, deduplicationCount: previousDeduplicationCount + 1 });
    } catch (err) {
      this.logger?.error({ msg: 'an error accord during job delay change', queueName: this.queueName, jobId, delay, err: err });
    }
  }
}
