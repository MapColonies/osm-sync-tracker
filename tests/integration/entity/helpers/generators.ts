import { faker } from '@faker-js/faker';
import { ActionType, EntityStatus } from '../../../../src/common/enums';

import { Entity } from '../../../../src/entity/models/entity';

export type FakeStringifiedFileParams = Partial<Entity>;

export type StringifiedEntity = Partial<Entity>;

export const createStringifiedFakeEntity = (params: FakeStringifiedFileParams = {}): StringifiedEntity => {
  return {
    entityId: params.entityId ?? `{${faker.datatype.uuid()}}`,
    fileId: params.fileId ?? undefined,
    changesetId: params.changesetId ?? undefined,
    action: params.action ?? ActionType.CREATE,
    status: params.status ?? EntityStatus.IN_PROGRESS,
  };
};
