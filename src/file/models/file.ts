import { Status } from '../../common/enums';

export interface File {
  fileId: string;

  syncId: string;

  totalEntities?: number | null;

  startDate: Date;

  endDate?: Date | null;

  status: Status;
}
