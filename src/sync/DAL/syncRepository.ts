import { GeometryType } from '../../common/enums';
import { Sync, SyncUpdate, SyncWithReruns } from '../models/sync';

export const syncRepositorySymbol = Symbol('SyncRepository');

export interface ISyncRepository {
  getLatestSync: (layerId: number, geometryType: GeometryType) => Promise<Sync | undefined>;

  createSync: (sync: Sync) => Promise<void>;

  updateSync: (syncId: string, updatedSync: SyncUpdate) => Promise<void>;

  findOneSync: (syncId: string) => Promise<Sync | undefined>;

  findSyncs: (filter: Partial<Sync>) => Promise<Sync[]>;

  findOneSyncWithReruns: (syncId: string) => Promise<SyncWithReruns | undefined>;
}
