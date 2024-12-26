import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQOtel } from 'bullmq-otel';
import IORedis from 'ioredis';
import { inject, injectable } from 'tsyringe';
import { CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, SYNCS_QUEUE_NAME } from '../constants';
import { IConfig } from '../../common/interfaces';
import { SERVICES } from '../../common/constants';

@injectable()
export class BullBoard {
  private readonly serverAdapter: ExpressAdapter;

  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.REDIS) private readonly redisConnection: IORedis) {
    const uiPath = this.config.get<string>('closure.uiPath');
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath(uiPath);
  }

  public getBullBoardRouter(): ReturnType<ExpressAdapter['getRouter']> {
    const queues = [CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, SYNCS_QUEUE_NAME].map(
      (queueName) => new Queue(queueName, { connection: this.redisConnection, telemetry: new BullMQOtel('temp') })
    );

    createBullBoard({
      queues: queues.map((queue) => new BullMQAdapter(queue)),
      serverAdapter: this.serverAdapter,
    });

    return this.serverAdapter.getRouter();
  }
}
