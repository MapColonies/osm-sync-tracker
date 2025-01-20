import { faker } from '@faker-js/faker';
import { GeometryType, Status } from '../../../../src/common/enums';
import { generateUniqueNumber, MAX_RANDOM_NUMERIC_VALUE } from '../../../helpers/helper';
import { StringifiedRerunCreateBody, StringifiedSync } from '../types';

export type FakeStringifiedSyncParams = Partial<StringifiedSync>;

export const createStringifiedFakeSync = (params: FakeStringifiedSyncParams = {}): StringifiedSync => {
  return {
    id: params.id ?? faker.string.uuid(),

    dumpDate: params.dumpDate ?? faker.date.anytime().toISOString(),

    startDate: params.startDate ?? faker.date.anytime().toISOString(),

    status: params.status ?? Status.IN_PROGRESS,

    layerId: params.layerId ?? generateUniqueNumber(),

    isFull: params.isFull ?? faker.datatype.boolean(),

    totalFiles: params.totalFiles ?? faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE }),

    geometryType: params.geometryType ?? GeometryType.POLYGON,
  };
};

export type FakeStringifiedRerunCreateBodyParams = Partial<StringifiedRerunCreateBody>;

export const createStringifiedFakeRerunCreateBody = (params: FakeStringifiedRerunCreateBodyParams = {}): StringifiedRerunCreateBody => {
  return {
    rerunId: params.rerunId ?? faker.string.uuid(),
    startDate: params.startDate ?? faker.date.anytime().toISOString(),
    shouldRerunNotSynced: params.shouldRerunNotSynced ?? faker.datatype.boolean(),
  };
};
