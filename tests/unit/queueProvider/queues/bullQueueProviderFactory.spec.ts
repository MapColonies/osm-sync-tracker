import jsLogger from '@map-colonies/js-logger';
import IORedis from 'ioredis';
import { ConnectionOptions, Queue, QueueEvents } from 'bullmq';
import { Registry } from 'prom-client';
import { BullQueueProviderFactory } from '../../../../src/queueProvider/queues/bullQueueProviderFactory';
import { BullQueueProvider } from '../../../../src/queueProvider/queues/bullQueueProvider';
import { ConfigType } from '../../../../src/common/config';

const queueMock = {};
const queueEventsMock = {};

jest.mock('../../../../src/queueProvider/queues/bullQueueProvider');
jest.mock('bullmq', () => ({
  /* eslint-disable @typescript-eslint/naming-convention */
  QueueEvents: jest.fn().mockImplementation(() => queueEventsMock),
  Queue: jest.fn().mockImplementation(() => queueMock),
  /* eslint-enable @typescript-eslint/naming-convention */
}));

let bullFactory: BullQueueProviderFactory;

describe('BullQueueProviderFactory', () => {
  const redis = jest.fn() as unknown as IORedis;
  const connectionOptions = jest.fn() as unknown as ConnectionOptions;
  const childLogger = jest.fn();
  const configGetMock = jest.fn();
  const metricsRegistry = new Registry();

  beforeEach(() => {
    jest.resetAllMocks();

    const loggerMock = {
      ...jsLogger({ enabled: false }),
      child: jest.fn().mockImplementation(() => childLogger),
    };

    bullFactory = new BullQueueProviderFactory(
      loggerMock,
      { get: configGetMock } as unknown as ConfigType,
      redis,
      connectionOptions,
      metricsRegistry
    );
  });

  describe('#createQueue', () => {
    it('creates a queue without errors for disabled deduplication delay', () => {
      configGetMock.mockReturnValueOnce({ queueOptions: { a: 1 }, jobOptions: { deduplicationDelay: undefined } });

      bullFactory.createQueue('files');

      expect(Queue).toHaveBeenCalledTimes(1);
      expect(QueueEvents).not.toHaveBeenCalled();
      expect(BullQueueProvider).toHaveBeenCalledTimes(1);
      expect(BullQueueProvider).toHaveBeenCalledWith({
        queue: queueMock,
        queueName: 'files',
        queueEvents: undefined,
        queueOptions: { a: 1 },
        jobOptions: { deduplicationDelay: undefined },
        logger: childLogger,
        metricsRegistry: metricsRegistry,
      });
    });

    it('creates a queue without errors for enabled deduplication delay', () => {
      configGetMock.mockReturnValueOnce({ queueOptions: { b: 2 }, jobOptions: { deduplicationDelay: 100 } });

      bullFactory.createQueue('files');

      expect(Queue).toHaveBeenCalledTimes(1);
      expect(QueueEvents).toHaveBeenCalledTimes(1);
      expect(BullQueueProvider).toHaveBeenCalledTimes(1);
      expect(BullQueueProvider).toHaveBeenCalledWith({
        queue: queueMock,
        queueName: 'files',
        queueEvents: queueEventsMock,
        queueOptions: { b: 2 },
        jobOptions: { deduplicationDelay: 100 },
        logger: childLogger,
        metricsRegistry: metricsRegistry,
      });
    });
  });
});
