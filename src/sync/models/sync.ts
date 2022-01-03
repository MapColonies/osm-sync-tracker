import { Status, GeometryType } from '../../common/enums';
import { Rerun } from '../DAL/typeorm/rerun';

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

  isRerun: boolean;
}

export type SyncUpdate = Omit<Partial<Sync>, 'id' | 'isFull'>;

export type SyncWithReruns = Sync & { reruns: Rerun[] };
