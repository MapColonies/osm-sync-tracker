import { Sync } from '../models/sync';

export const syncRepositorySymbol = Symbol('SyncRepository');

export interface SyncRepository {
  getLatestSync: (layerId: number) => Promise<Sync>;

  createSync: (sync: Sync) => Promise<void>;

  updateSync: (sync: Sync) => Promise<void>;
}
