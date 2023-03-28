import { Status, GeometryType } from '../../common/enums';

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
