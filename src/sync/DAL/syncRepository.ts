import { GeometryType } from '../../common/enums';
import { Sync } from '../models/sync';

export const syncRepositorySymbol = Symbol('SyncRepository');

export interface ISyncRepository {
  getLatestSync: (layerId: number, geometryType: GeometryType) => Promise<Sync | undefined>;

  createSync: (sync: Sync) => Promise<void>;

  updateSync: (sync: Sync) => Promise<void>;

  findOneSync: (syncId: string) => Promise<Sync | undefined>;
}
