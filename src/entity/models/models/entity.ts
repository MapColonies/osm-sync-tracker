import { ActionType, Status } from '../../../common/enums';

export type UpdateEntity = Omit<Partial<Entity>, 'entityId' | 'fileId'>;

export interface Entity {
  entityId: string;

  fileId: string;

  changesetId?: string;

  status: Status;

  action: ActionType;

  failReason?: string;
}
