import { Job } from 'bullmq';
import { delayJob, updateJobCounter } from '../../../src/queueProvider/helpers';
import { Identifiable } from '../../../src/queueProvider/interfaces';

describe('helpers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('#delayJob', () => {
    it('should delay job with no previous deduplication count', async () => {
      const now = 1000;
      const delay = 200;
      const moveToDelayedMock = jest.fn();
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      const jobMock = { id: 'id', data: {}, moveToDelayed: moveToDelayedMock };

      const promise = delayJob(jobMock as unknown as Job<Identifiable>, delay);

      await expect(promise).resolves.not.toThrow();
      expect(moveToDelayedMock).toHaveBeenCalledTimes(1);
      expect(moveToDelayedMock).toHaveBeenCalledWith(now + delay);
    });
  });

  describe('#updateJobCounter', () => {
    it('should update job with no previous deduplication count', async () => {
      const updateDataMock = jest.fn();
      const jobMock = { id: 'id', data: { transactionFailureCount: 3 }, updateData: updateDataMock };

      const promise = updateJobCounter(jobMock as unknown as Job<Identifiable>, 'deduplication');

      await expect(promise).resolves.not.toThrow();
      expect(updateDataMock).toHaveBeenCalledTimes(1);
      expect(updateDataMock).toHaveBeenCalledWith({ transactionFailureCount: 3, deduplicationCount: 1 });
    });

    it('should update job with some previous deduplication count', async () => {
      const updateDataMock = jest.fn();
      const jobMock = { id: 'id', data: { transactionFailureCount: 3, deduplicationCount: 5 }, updateData: updateDataMock };

      const promise = updateJobCounter(jobMock as unknown as Job<Identifiable>, 'deduplication');

      await expect(promise).resolves.not.toThrow();
      expect(updateDataMock).toHaveBeenCalledTimes(1);
      expect(updateDataMock).toHaveBeenCalledWith({ transactionFailureCount: 3, deduplicationCount: 6 });
    });

    it('should update job with some previous transaction failure count', async () => {
      const updateDataMock = jest.fn();
      const jobMock = { id: 'id', data: { transactionFailureCount: 3, deduplicationCount: 5 }, updateData: updateDataMock };

      const promise = updateJobCounter(jobMock as unknown as Job<Identifiable>, 'transactionFailure');

      await expect(promise).resolves.not.toThrow();
      expect(updateDataMock).toHaveBeenCalledTimes(1);
      expect(updateDataMock).toHaveBeenCalledWith({ transactionFailureCount: 4, deduplicationCount: 5 });
    });
  });
});
