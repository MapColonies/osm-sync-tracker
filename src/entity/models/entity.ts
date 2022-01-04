import { ActionType, EntityStatus } from '../../common/enums';

export type UpdateEntity = Omit<Partial<Entity>, 'entityId' | 'fileId'>;

export type UpdateEntities = (UpdateEntity & { entityId: string; fileId: string })[];

export interface Entity {
  entityId: string;

  fileId?: string;

  changesetId?: string | null;

  status: EntityStatus;

  action: ActionType;

  failReason?: string | null;
}
