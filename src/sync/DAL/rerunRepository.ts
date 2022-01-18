import { Rerun } from '../models/rerun';
import { Sync } from '../models/sync';

export const rerunRepositorySymbol = Symbol('RerunRepository');

export interface IRerunRepository {
  createRerun: (rerun: Rerun, sync: Sync) => Promise<void>;

  findOneRerun: (rerunId: string) => Promise<Rerun | undefined>;

  findReruns: (filter: Partial<Rerun>) => Promise<Rerun[]>;
}
