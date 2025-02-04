import { faker } from '@faker-js/faker';
import { Status } from '../../../../src/common/enums';
import { StringifiedFile } from '../types';
import { MAX_RANDOM_NUMERIC_VALUE } from '../../../helpers/helper';

export type FakeStringifiedFileParams = Partial<StringifiedFile>;

export const createStringifiedFakeFile = (params: FakeStringifiedFileParams = {}): StringifiedFile => {
  return {
    totalEntities: params.totalEntities ?? faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE }),

    fileId: params.fileId ?? faker.string.uuid(),

    startDate: params.startDate ?? faker.date.anytime().toISOString(),

    status: params.status ?? Status.IN_PROGRESS,
  };
};
