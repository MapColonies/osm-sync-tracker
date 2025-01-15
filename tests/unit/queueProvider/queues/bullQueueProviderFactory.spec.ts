import jsLogger from '@map-colonies/js-logger';
import IORedis from 'ioredis';
import { ConnectionOptions, Queue, QueueEvents } from 'bullmq';
import { BullQueueProviderFactory } from '../../../../src/queueProvider/queues/bullQueueProviderFactory';
import { BullQueueProvider } from '../../../../src/queueProvider/queues/bullQueueProvider';

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

  beforeEach(() => {
    jest.resetAllMocks();

    const loggerMock = {
      ...jsLogger({ enabled: false }),
      child: jest.fn().mockImplementation(() => childLogger),
    };

    bullFactory = new BullQueueProviderFactory(loggerMock, { get: configGetMock, has: jest.fn() }, redis, connectionOptions);
  });

  describe('#createQueue', () => {
    it('creates a queue without errors for disabled deduplication delay', () => {
      configGetMock.mockReturnValueOnce('queueOptions');
      configGetMock.mockReturnValueOnce({ deduplicationDelay: undefined });

      bullFactory.createQueue('name');

      expect(Queue).toHaveBeenCalledTimes(1);
      expect(QueueEvents).not.toHaveBeenCalled();
      expect(BullQueueProvider).toHaveBeenCalledTimes(1);
      expect(BullQueueProvider).toHaveBeenCalledWith({
        queue: queueMock,
        queueName: 'name',
        queueEvents: undefined,
        queueOptions: 'queueOptions',
        jobOptions: { deduplicationDelay: undefined },
        logger: childLogger,
      });
    });

    it('creates a queue without errors for enabled deduplication delay', () => {
      configGetMock.mockReturnValueOnce('queueOptions');
      configGetMock.mockReturnValueOnce({ deduplicationDelay: 100 });

      bullFactory.createQueue('name');

      expect(Queue).toHaveBeenCalledTimes(1);
      expect(QueueEvents).toHaveBeenCalledTimes(1);
      expect(BullQueueProvider).toHaveBeenCalledTimes(1);
      expect(BullQueueProvider).toHaveBeenCalledWith({
        queue: queueMock,
        queueName: 'name',
        queueEvents: queueEventsMock,
        queueOptions: 'queueOptions',
        jobOptions: { deduplicationDelay: 100 },
        logger: childLogger,
      });
    });
  });
});
