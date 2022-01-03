import { Sync } from '../models/sync';

export const rerunRepositorySymbol = Symbol('RerunRepository');

export interface IRerunRepository {
  createRerun: (referenceSync: Sync, rerunNumber: number) => Promise<Sync>;
}
