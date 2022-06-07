import { faker } from '@faker-js/faker';

import { StringifiedSync } from '../types';

export type FakeStringifiedChangesetParams = Partial<StringifiedSync>;

export const createStringifiedFakeChangeset = (params: FakeStringifiedChangesetParams = {}): StringifiedSync => {
  return {
    changesetId: params.changesetId ?? `${faker.datatype.uuid()}`,
    osmId: params.osmId ?? faker.datatype.number(),
  } as StringifiedSync;
};
