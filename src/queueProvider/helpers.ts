import { Job } from 'bullmq';
import { Identifiable } from './interfaces';

const getCounterKey = (kind: CounterKind): string => {
  if (kind === 'deduplication') {
    return DEDUPLICATION_COUNT_KEY;
  }
  return TRANSACTIONAL_FAILURE_COUNT_KEY;
};

export const DEDUPLICATION_COUNT_KEY = 'deduplicationCount';
export const TRANSACTIONAL_FAILURE_COUNT_KEY = 'transactionFailureCount';

export type CounterKind = 'deduplication' | 'transactionFailure';

export const delayJob = async (job: Job, delay: number): Promise<void> => {
  await job.moveToDelayed(Date.now() + delay);
};

export const updateJobCounter = async (job: Job<Identifiable>, counterKind: CounterKind): Promise<void> => {
  const key = getCounterKey(counterKind);

  const previousCount = (job.data[key] as number | undefined) ?? 0;

  await job.updateData({ ...job.data, [key]: previousCount + 1 });
};
