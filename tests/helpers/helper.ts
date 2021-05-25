import faker from 'faker';
import { Status } from '../../src/common/enums';
import { Sync } from '../../src/sync/models/sync';
import { File } from '../../src/file/models/file';

export const createFakeSync: () => Sync = () => {
  return {
    id: faker.datatype.uuid(),

    dumpDate: faker.datatype.datetime(),

    startDate: faker.datatype.datetime(),

    endDate: null,

    status: Status.IN_PROGRESS,

    layerId: faker.datatype.number(),

    isFull: faker.datatype.boolean(),

    totalFiles: faker.datatype.number(),
  };
};

export const createFakeFile: () => File = () => {
  return {
    fileId: faker.datatype.uuid(),

    syncId: faker.datatype.uuid(),

    totalEntities: faker.datatype.number(),

    startDate: faker.datatype.datetime(),

    endDate: undefined,

    status: Status.IN_PROGRESS,
  };
};
