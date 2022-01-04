import faker from 'faker';
import { ActionType, EntityStatus } from '../../../../src/common/enums';

import { Entity } from '../../../../src/entity/models/entity';

export type FakeStringifiedFileParams = Partial<Entity>;

export type StringifiedEntity = Partial<Omit<Entity, 'changeset'>> & { changesetId?: string | null };

export const createStringifiedFakeEntity = (params: FakeStringifiedFileParams = {}): StringifiedEntity => {
  return {
    entityId: params.entityId ?? `{${faker.datatype.uuid()}}`,
    fileId: params.fileId ?? undefined,
    action: params.action ?? ActionType.CREATE,
    status: params.status ?? EntityStatus.IN_PROGRESS,
  };
};
