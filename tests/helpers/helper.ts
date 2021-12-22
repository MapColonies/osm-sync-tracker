import faker from 'faker';
import { ActionType, EntityStatus, GeometryType, Status } from '../../src/common/enums';
import { Sync } from '../../src/sync/models/sync';
import { File } from '../../src/file/models/file';
import { Entity } from '../../src/entity/models/entity';
import { Changeset } from '../../src/changeset/models/changeset';

export const createFakeSync = (): Sync => {
  return {
    id: faker.datatype.uuid(),

    dumpDate: faker.datatype.datetime(),

    startDate: faker.datatype.datetime(),

    status: Status.IN_PROGRESS,

    layerId: faker.datatype.number(),

    isFull: faker.datatype.boolean(),

    totalFiles: faker.datatype.number(),

    geometryType: GeometryType.POLY,
  };
};

export const createMultipleSyncData = (amount: number): Sync[] => {
  const data: Sync[] = [];
  for (let i = 0; i < amount; i++) {
    data.push(createFakeSync());
  }
  return data;
};

export const createFakeFile = (): File => {
  return {
    fileId: faker.datatype.uuid(),

    syncId: faker.datatype.uuid(),

    totalEntities: faker.datatype.number(),

    startDate: faker.datatype.datetime(),

    endDate: undefined,

    status: Status.IN_PROGRESS,
  };
};

export const createFakeFiles = (quantity: number): File[] => {
  const files: File[] = [];
  for (let i = 0; i < quantity; i++) {
    files.push(createFakeFile());
  }
  return files;
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

export const createFakeEntities = (quantity: number): Entity[] => {
  const entities: Entity[] = [];
  for (let i = 0; i < quantity; i++) {
    entities.push(createFakeEntity());
  }
  return entities;
};

export const createFakeChangeset: () => Changeset = () => {
  return {
    changesetId: faker.datatype.uuid(),

    osmId: faker.datatype.number(),
  };
};
