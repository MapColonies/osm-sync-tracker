import { Job } from 'bullmq';
import { Identifiable } from './interfaces';

export type ClosureKind = 'changeset' | 'file' | 'sync';

export interface ClosureJob extends Identifiable {
  kind: ClosureKind;
}

export interface BatchClosureJob extends ClosureJob {
  batchIds: string[];
}

export interface ClosedId {
  [id: string]: string;
}

export interface ClosureReturn {
  closedCount?: number;
  closedIds?: string[];
  invokedJobCount: number;
  invokedJobs: ClosureJob[];
}

export type ProcessFn<T = ClosureJob | BatchClosureJob, R = ClosureReturn> = (job: Job<T, R>) => R;
