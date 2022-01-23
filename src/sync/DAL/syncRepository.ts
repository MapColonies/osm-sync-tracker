import { GeometryType } from '../../common/enums';
import { BaseSync, Sync, SyncUpdate, SyncWithReruns } from '../models/sync';

export const syncRepositorySymbol = Symbol('SyncRepository');

export interface ISyncRepository {
  getLatestSync: (layerId: number, geometryType: GeometryType) => Promise<BaseSync | undefined>;

  createSync: (sync: Sync) => Promise<void>;

  updateSync: (syncId: string, updatedSync: SyncUpdate) => Promise<void>;

  findOneSync: (syncId: string) => Promise<Sync | undefined>;

  findSyncs: (filter: Partial<Sync>) => Promise<Sync[]>;

  findOneSyncWithLastRerun: (syncId: string) => Promise<SyncWithReruns | undefined>;

  createRerun: (sync: Sync, schema: string) => Promise<void>;
}
