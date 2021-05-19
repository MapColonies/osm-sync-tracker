import { Status } from '../../common/enums';

export interface File {
  fileId: string;

  syncId: string;

  totalEntities?: number;

  startDate: Date;

  endDate?: Date;

  status: Status;
}
