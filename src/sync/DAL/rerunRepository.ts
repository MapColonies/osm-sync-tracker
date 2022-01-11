import { Sync } from '../models/sync';
import { Rerun } from '../models/rerun';

export const rerunRepositorySymbol = Symbol('RerunRepository');

export interface IRerunRepository {
  createRerun: (referenceSync: Sync, rerunId: string, rerunNumber: number) => Promise<void>;

  findOneRerun: (rerunId: string) => Promise<Rerun | undefined>;

  findReruns: (filter: Partial<Rerun>) => Promise<Rerun[]>;
}
