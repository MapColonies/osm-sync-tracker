import { Sync } from '../models/sync';
import { Rerun } from '../models/rerun';

export const rerunRepositorySymbol = Symbol('RerunRepository');

export interface IRerunRepository {
  createRerun: (referenceSync: Sync, rerunNumber: number) => Promise<Sync>;

  findOneRerun: (rerunId: string) => Promise<Rerun | undefined>;

  findReruns: (filter: Partial<Rerun>) => Promise<Rerun[]>;
}
