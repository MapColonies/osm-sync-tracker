import faker from 'faker';
import { ActionType, EntityStatus, Status } from '../../src/common/enums';
import { Sync } from '../../src/sync/models/sync';
import { File } from '../../src/file/models/file';
import { Entity } from '../../src/entity/models/entity';
import { Changeset } from '../../src/changeset/models/changeset';

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

export const createFakeEntity: () => Entity = () => {
  return {
    entityId: faker.datatype.uuid(),

    fileId: faker.datatype.uuid(),

    changesetId: faker.datatype.uuid(),

    status: EntityStatus.IN_PROGRESS,

    action: ActionType.CREATE,
  };
};

export const createFakeChangeset: () => Changeset = () => {
  return {
    changesetId: faker.datatype.uuid(),

    osmId: faker.datatype.number(),
  };
};
