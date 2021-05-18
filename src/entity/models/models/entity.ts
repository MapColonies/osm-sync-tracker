import { Status } from '../../../common/enums';

export interface Entity {
  entityId: string;

  fileId: string;

  changesetId: string;

  status: Status;

  action: string;

  failReason: string;
}
