import { Status, GeometryType } from '../../common/enums';

export type GeometryTypeString = 'point' | 'linestring' | 'polygon';

export interface Sync {
  id: string;

  dumpDate: Date;

  startDate: Date;

  endDate?: Date | null;

  status: Status;

  layerId: number;

  isFull: boolean;

  totalFiles: number | null;

  geometryType: GeometryType;

  baseSyncId: string | null;

  runNumber: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typeorm's QueryDeepPartialEntity does not recognize unknown types
  metadata: Record<string, any> | null;
}

export type BaseSync = Omit<Sync, 'baseSyncId' | 'runNumber'>;

export type SyncUpdate = Omit<Partial<Sync>, 'id' | 'isFull'>;

export type SyncWithReruns = Sync & { reruns: Sync[] };

export type CreateRerunRequest = Sync & { shouldRerunNotSynced: boolean };

export interface SyncsFilter {
  layerId?: number[];
  status?: Status[];
  geometryType?: GeometryType[];
  isFull?: boolean;
  isRerun?: boolean;
}
