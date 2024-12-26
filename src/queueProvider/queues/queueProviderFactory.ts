import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import IORedis from 'ioredis';
import { ConnectionOptions, QueueEvents } from 'bullmq';
import { IConfig } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';
import { REDIS_CONNECTION_OPTIONS_SYMBOL } from '../constants';
import { Identifiable, JobQueueProvider } from '../interfaces';
import { BullQueueProvider } from './bullQueueProvider';
import { ExtendedJobOptions, QueueOptions } from './options';

@injectable()
export class QueueProviderFactory {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.REDIS) private readonly reusableRedis: IORedis,
    @inject(REDIS_CONNECTION_OPTIONS_SYMBOL) private readonly connectionOptions: ConnectionOptions
  ) {}

  public createQueue<T extends Identifiable>(queueName: string): JobQueueProvider<T> {
    const queueLogger = this.logger.child({ component: `${queueName}-queue` });

    const queueOptions = this.config.get<QueueOptions>(`closure.queues.${queueName}.queueOptions`);

    const jobOptions = this.config.get<ExtendedJobOptions>(`closure.queues.${queueName}.jobOptions`);

    let queueEvents: QueueEvents | undefined;
    if (jobOptions.deduplicationDelay !== undefined) {
      queueEvents = new QueueEvents(queueName, { connection: this.connectionOptions });
    }

    return new BullQueueProvider<T>({
      queueName,
      logger: queueLogger,
      connection: this.reusableRedis,
      queueEvents,
      queueOptions,
      jobOptions,
    });
  }
}
