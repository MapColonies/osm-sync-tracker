import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import IORedis from 'ioredis';
import { ConnectionOptions, Queue, QueueEvents } from 'bullmq';
import { ConfigType } from '../../common/config';
import { ClosureQueueConfig, QueueName } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { KEY_PREFIX, REDIS_CONNECTION_OPTIONS_SYMBOL } from '../constants';
import { Identifiable, JobQueueProvider } from '../interfaces';
import { BullQueueProvider } from './bullQueueProvider';

@injectable()
export class BullQueueProviderFactory {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.REDIS) private readonly reusableRedis: IORedis,
    @inject(REDIS_CONNECTION_OPTIONS_SYMBOL) private readonly connectionOptions: ConnectionOptions
  ) {}

  public createQueue<T extends Identifiable>(queueName: QueueName): JobQueueProvider<T> {
    const queueLogger = this.logger.child({ component: `${queueName}-queue` });

    const queueConfig = this.config.get(`closure.queues.${queueName}`) as ClosureQueueConfig;

    let queueEvents: QueueEvents | undefined;
    if (queueConfig.jobOptions.deduplicationDelay !== undefined) {
      queueEvents = new QueueEvents(queueName, { connection: this.connectionOptions, prefix: KEY_PREFIX });
    }

    const queue = new Queue<T, unknown, string, T, unknown, string>(queueName, {
      connection: this.reusableRedis,
      prefix: KEY_PREFIX,
    });

    return new BullQueueProvider<T>({
      queue,
      queueName,
      queueEvents,
      queueOptions: queueConfig.queueOptions,
      jobOptions: queueConfig.jobOptions,
      logger: queueLogger,
    });
  }
}
