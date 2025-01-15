import { Queue } from 'bullmq';
import { BullQueueProvider } from '../../../../src/queueProvider/queues/bullQueueProvider';
import { Identifiable } from '../../../../src/queueProvider/interfaces';
import { ExtendedJobOptions } from '../../../../src/queueProvider/queues/options';
import { hashBatch } from '../../../../src/common/utils';

describe('BullQueueProvider', () => {
  let provider: BullQueueProvider<Identifiable>;

  const getJobMock = jest.fn();

  const queueMock = {
    close: jest.fn(),
    add: jest.fn(),
    addBulk: jest.fn(),
    getJob: getJobMock,
  } as unknown as Queue;

  const queueName = 'test-queue-name';
  const jobOptions = { key: 'value' } as unknown as ExtendedJobOptions;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('WithoutBatching', () => {
    beforeEach(() => {
      provider = new BullQueueProvider({ queue: queueMock, queueName, jobOptions, queueOptions: { enabledBatchJobs: false } });
    });

    describe('#push', () => {
      it('should add a single job to the queue', async () => {
        const job1 = { id: '1' };
        const promise = provider.push([job1]);

        await expect(promise).resolves.not.toThrow();

        expect(queueMock['add']).toHaveBeenCalledTimes(1);
        expect(queueMock['add']).toHaveBeenCalledWith(job1.id, job1, { ...jobOptions, deduplication: { id: job1.id } });
        expect(queueMock['addBulk']).not.toHaveBeenCalled();
      });

      it('should add a bulk jobs to the queue without batching', async () => {
        const job1 = { id: '1' };
        const job2 = { id: '2' };
        const promise = provider.push([job1, job2]);

        await expect(promise).resolves.not.toThrow();

        expect(queueMock['add']).not.toHaveBeenCalled();
        expect(queueMock['addBulk']).toHaveBeenCalledTimes(1);
        expect(queueMock['addBulk']).toHaveBeenCalledWith([
          { name: job1.id, data: job1, opts: { ...jobOptions, deduplication: { id: job1.id } } },
          { name: job2.id, data: job2, opts: { ...jobOptions, deduplication: { id: job2.id } } },
        ]);
      });
    });
  });

  describe('WithBatching', () => {
    beforeEach(() => {
      provider = new BullQueueProvider({ queue: queueMock, queueName, jobOptions, queueOptions: { enabledBatchJobs: true, maxBatchSize: 2 } });
    });

    describe('#push', () => {
      it('should add a single job to the queue', async () => {
        const job1 = { id: '1' };
        const promise = provider.push([job1]);

        await expect(promise).resolves.not.toThrow();

        expect(queueMock['add']).toHaveBeenCalledTimes(1);
        expect(queueMock['add']).toHaveBeenCalledWith(job1.id, job1, { ...jobOptions, deduplication: { id: job1.id } });
        expect(queueMock['addBulk']).not.toHaveBeenCalled();
      });

      it('should add a bulk of batched jobs to the queue', async () => {
        const job1 = { id: '1' };
        const job2 = { id: '2' };
        const job3 = { id: '3' };
        const promise = provider.push([job1, job2, job3]);

        await expect(promise).resolves.not.toThrow();

        const idsOfBatch1 = [job1.id, job2.id];
        const batchId1 = hashBatch(idsOfBatch1);

        const idsOfBatch2 = [job3.id];
        const batchId2 = hashBatch(idsOfBatch2);

        const batchJobs1 = { id: batchId1, batchIds: idsOfBatch1 };
        const batchJobs2 = { id: batchId2, batchIds: idsOfBatch2 };

        expect(queueMock['add']).not.toHaveBeenCalled();
        expect(queueMock['addBulk']).toHaveBeenCalledTimes(1);
        expect(queueMock['addBulk']).toHaveBeenCalledWith([
          { name: batchJobs1.id, data: batchJobs1, opts: { ...jobOptions, deduplication: { id: batchJobs1.id } } },
          { name: batchJobs2.id, data: batchJobs2, opts: { ...jobOptions, deduplication: { id: batchJobs2.id } } },
        ]);
      });
    });
  });

  describe('#changeJobDelay', () => {
    it('should change the delay of a job with no previous deduplication count', async () => {
      const delay = 200;
      const jobChangeDelayMock = jest.fn();
      const jobUpdateDataMock = jest.fn();
      const job = { id: 'id', data: {}, changeDelay: jobChangeDelayMock, updateData: jobUpdateDataMock };
      getJobMock.mockResolvedValue(job);
      const promise = provider.changeJobDelay(job.id, delay);

      await expect(promise).resolves.not.toThrow();

      expect(queueMock['getJob']).toHaveBeenCalledTimes(1);
      expect(queueMock['getJob']).toHaveBeenCalledWith(job.id);
      expect(jobChangeDelayMock).toHaveBeenCalledTimes(1);
      expect(jobChangeDelayMock).toHaveBeenCalledWith(delay);
      expect(jobUpdateDataMock).toHaveBeenCalledTimes(1);
      expect(jobUpdateDataMock).toHaveBeenCalledWith({ ...job.data, deduplicationCount: 1 });
    });

    it('should change the delay of a job with some previous deduplication count', async () => {
      const delay = 200;
      const jobChangeDelayMock = jest.fn();
      const jobUpdateDataMock = jest.fn();
      const job = { id: 'id', data: { deduplicationCount: 3 }, changeDelay: jobChangeDelayMock, updateData: jobUpdateDataMock };
      getJobMock.mockResolvedValue(job);
      const promise = provider.changeJobDelay(job.id, delay);

      await expect(promise).resolves.not.toThrow();

      expect(queueMock['getJob']).toHaveBeenCalledTimes(1);
      expect(queueMock['getJob']).toHaveBeenCalledWith(job.id);
      expect(jobChangeDelayMock).toHaveBeenCalledTimes(1);
      expect(jobChangeDelayMock).toHaveBeenCalledWith(delay);
      expect(jobUpdateDataMock).toHaveBeenCalledTimes(1);
      expect(jobUpdateDataMock).toHaveBeenCalledWith({ ...job.data, deduplicationCount: 4 });
    });

    it('should retrun void if job was not found', async () => {
      const delay = 200;
      const jobChangeDelayMock = jest.fn();
      const jobUpdateDataMock = jest.fn();
      getJobMock.mockResolvedValue(undefined);
      const jobId = 'notFoundId';
      const promise = provider.changeJobDelay(jobId, delay);

      await expect(promise).resolves.not.toThrow();

      expect(queueMock['getJob']).toHaveBeenCalledTimes(1);
      expect(queueMock['getJob']).toHaveBeenCalledWith(jobId);
      expect(jobChangeDelayMock).not.toHaveBeenCalled();
      expect(jobUpdateDataMock).not.toHaveBeenCalled();
    });

    it('should not throw even if an error occurs', async () => {
      const error = new Error('queue error');
      getJobMock.mockRejectedValue(error);
      const promise = provider.changeJobDelay('id', 200);

      await expect(promise).resolves.not.toThrow();

      expect(queueMock['getJob']).toHaveBeenCalledTimes(1);
      expect(queueMock['getJob']).toHaveBeenCalledWith('id');
    });
  });

  describe('#activeQueueName', () => {
    it('should return the queue name', () => {
      expect(provider.activeQueueName).toMatch(queueName);
    });
  });

  describe('#shutdown', () => {
    it('should stop the queue provider', async () => {
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });
});
