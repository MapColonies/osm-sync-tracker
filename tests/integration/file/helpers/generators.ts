import { faker } from '@faker-js/faker';
import { Status } from '../../../../src/common/enums';
import { StringifiedFile } from '../types';

export type FakeStringifiedFileParams = Partial<StringifiedFile>;

export const createStringifiedFakeFile = (params: FakeStringifiedFileParams = {}): StringifiedFile => {
  return {
    totalEntities: params.totalEntities ?? faker.datatype.number(),

    fileId: params.fileId ?? faker.datatype.uuid(),

    startDate: params.startDate ?? faker.datatype.datetime().toISOString(),

    status: params.status ?? Status.IN_PROGRESS,
  };
};
