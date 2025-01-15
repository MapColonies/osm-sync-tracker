import { Worker } from 'bullmq';
import { ProcessFn } from './types';

export interface Identifiable {
  [property: string]: unknown;
  id: string;
}

export interface JobQueueProvider<T> {
  activeQueueName: string;
  push: (jobs: T[]) => Promise<void>;
  shutdown: () => Promise<void>;
}

export interface WorkerWithFn {
  worker: Worker;
  processFn: ProcessFn;
}
