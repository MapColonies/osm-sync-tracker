import { faker } from '@faker-js/faker';
import { GeometryType, Status } from '../../../../src/common/enums';
import { generateUniqueNumber } from '../../../helpers/helper';
import { StringifiedRerunCreateBody, StringifiedSync } from '../types';

export type FakeStringifiedSyncParams = Partial<StringifiedSync>;

export const createStringifiedFakeSync = (params: FakeStringifiedSyncParams = {}): StringifiedSync => {
  return {
    id: params.id ?? faker.datatype.uuid(),

    dumpDate: params.dumpDate ?? faker.datatype.datetime().toISOString(),

    startDate: params.startDate ?? faker.datatype.datetime().toISOString(),

    status: params.status ?? Status.IN_PROGRESS,

    layerId: params.layerId ?? generateUniqueNumber(),

    isFull: params.isFull ?? faker.datatype.boolean(),

    totalFiles: params.totalFiles ?? faker.datatype.number(),

    geometryType: params.geometryType ?? GeometryType.POLYGON,
  };
};

export type FakeStringifiedRerunCreateBodyParams = Partial<StringifiedRerunCreateBody>;

export const createStringifiedFakeRerunCreateBody = (params: FakeStringifiedRerunCreateBodyParams = {}): StringifiedRerunCreateBody => {
  return {
    rerunId: params.rerunId ?? faker.datatype.uuid(),
    startDate: params.startDate ?? faker.datatype.datetime().toISOString(),
    shouldRerunNotSynced: params.shouldRerunNotSynced ?? faker.datatype.boolean(),
  };
};
