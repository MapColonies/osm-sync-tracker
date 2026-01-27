import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import IORedis from 'ioredis';
import { inject, injectable } from 'tsyringe';
import { ClosureConfig } from '@src/common/interfaces';
import { ConfigType } from '../../common/config';
import { CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, SYNCS_QUEUE_NAME } from '../constants';
import { SERVICES } from '../../common/constants';

@injectable()
export class BullBoard {
  private readonly serverAdapter: ExpressAdapter;
  private readonly keyPrefix: string;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.REDIS_QUEUE_CONNECTION) private readonly redisConnection: IORedis
  ) {
    const { uiPath, keyPrefix } = this.config.get('closure') as ClosureConfig;
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath(uiPath);
    this.keyPrefix = keyPrefix;
  }

  public getBullBoardRouter(): ReturnType<ExpressAdapter['getRouter']> {
    const queues = [CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, SYNCS_QUEUE_NAME].map(
      (queueName) => new Queue(queueName, { connection: this.redisConnection, prefix: this.keyPrefix })
    );

    createBullBoard({
      queues: queues.map((queue) => new BullMQAdapter(queue)),
      serverAdapter: this.serverAdapter,
    });

    return this.serverAdapter.getRouter();
  }
}
