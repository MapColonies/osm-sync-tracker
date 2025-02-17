import { Job } from 'bullmq';
import { Identifiable } from './interfaces';

const getCounterKey = (kind: CounterKind): string => {
  switch (kind) {
    case 'deduplication':
      return DEDUPLICATION_COUNT_KEY;
    case 'transactionFailure':
      return TRANSACTIONAL_FAILURE_COUNT_KEY;
    case 'stalledFailure':
      return STALLED_FAILURE_COUNT_KEY;
  }
};

export const DEDUPLICATION_COUNT_KEY = 'deduplicationCount';
export const TRANSACTIONAL_FAILURE_COUNT_KEY = 'transactionFailureCount';
export const STALLED_FAILURE_COUNT_KEY = 'stalledFailureCount';

export type CounterKind = 'deduplication' | 'transactionFailure' | 'stalledFailure';

export const delayJob = async (job: Job, delay: number): Promise<void> => {
  await job.moveToDelayed(Date.now() + delay);
};

export const incrementJobCounter = <T extends object, K extends keyof T>(data: T, counterKind: CounterKind): T & Record<K, number> => {
  const key = getCounterKey(counterKind);

  const previousCount = key in data ? (data[key as keyof T] as number) : 0;

  return { ...data, [key]: previousCount + 1 };
};

export const updateJobCounter = async (job: Job<Identifiable>, counterKind: CounterKind): Promise<void> => {
  const incremented = incrementJobCounter(job.data, counterKind);

  await job.updateData(incremented);
};
