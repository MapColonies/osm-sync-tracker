import { faker } from '@faker-js/faker';

import { StringifiedSync } from '../types';
import { MAX_RANDOM_NUMERIC_VALUE } from '../../../helpers/helper';

export type FakeStringifiedChangesetParams = Partial<StringifiedSync>;

export const createStringifiedFakeChangeset = (params: FakeStringifiedChangesetParams = {}): StringifiedSync => {
  return {
    changesetId: params.changesetId ?? `${faker.string.uuid()}`,
    osmId: params.osmId ?? faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE }),
  } as StringifiedSync;
};
