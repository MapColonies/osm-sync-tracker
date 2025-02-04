import { WorkerOptions } from 'bullmq';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

export interface ExtendedWorkerOptions extends WorkerOptions {
  transactionIsolationLevel: IsolationLevel;
  transactionFailureDelay: number;
}
