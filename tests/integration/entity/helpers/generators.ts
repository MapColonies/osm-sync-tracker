import faker from 'faker';
import { ActionType, EntityStatus } from '../../../../src/common/enums';

import { Entity } from '../../../../src/entity/models/entity';

export type FakeStringifiedFileParams = Partial<Entity>;

export const createStringifiedFakeEntity = (params: FakeStringifiedFileParams = {}): Entity => {
  return {
    entityId: params.entityId ?? `{${faker.datatype.uuid()}}`,
    action: params.action ?? ActionType.CREATE,
    status: params.status ?? EntityStatus.IN_PROGRESS,
  } as Entity;
};
