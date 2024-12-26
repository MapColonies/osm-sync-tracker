import { Job } from 'bullmq';
import { Identifiable } from './interfaces';

export const delayJob = async (job: Job<Identifiable>, delay: number): Promise<void> => {
  const previousTransactionFailureCount = (job.data.transactionFailureCount as number | undefined) ?? 0;

  await job.updateData({ ...job.data, transactionFailureCount: previousTransactionFailureCount + 1 });

  await job.moveToDelayed(Date.now() + delay);
};
