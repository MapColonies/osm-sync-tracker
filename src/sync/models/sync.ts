import { Status } from '../../common/enums';

export interface Sync {
  id: string;

  dumpDate: Date;

  startDate: Date;

  endDate?: Date | null;

  status: Status;

  layerId: number;

  isFull: boolean;

  totalFiles: number | null;
}
