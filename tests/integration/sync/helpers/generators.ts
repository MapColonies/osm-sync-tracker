import faker from 'faker';
import { GeometryType, Status } from '../../../../src/common/enums';
import { StringifiedRerun, StringifiedSync } from '../types';

export type FakeStringifiedSyncParams = Partial<StringifiedSync>;

export const createStringifiedFakeSync = (params: FakeStringifiedSyncParams = {}): StringifiedSync => {
  return {
    id: params.id ?? faker.datatype.uuid(),

    dumpDate: params.dumpDate ?? faker.datatype.datetime().toISOString(),

    startDate: params.startDate ?? faker.datatype.datetime().toISOString(),

    status: params.status ?? Status.IN_PROGRESS,

    layerId: params.layerId ?? faker.datatype.number(),

    isFull: params.isFull ?? faker.datatype.boolean(),

    totalFiles: params.totalFiles ?? faker.datatype.number(),

    geometryType: params.geometryType ?? GeometryType.POLYGON,

    isRerun: params.isRerun ?? false,
  };
};

export type FakeStringifiedRerunCreateBodyParams = Partial<StringifiedRerun>;

export const createStringifiedFakeRerunCreateBody = (params: FakeStringifiedRerunCreateBodyParams = {}): StringifiedRerun => {
  return {
    rerunId: params.rerunId ?? faker.datatype.uuid(),
    startDate: params.startDate ?? faker.datatype.datetime().toISOString(),
  };
};
