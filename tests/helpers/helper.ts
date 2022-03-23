import faker from 'faker';
import { ActionType, EntityStatus, GeometryType, Status } from '../../src/common/enums';
import { Sync } from '../../src/sync/models/sync';
import { File } from '../../src/file/models/file';
import { Entity } from '../../src/entity/models/entity';
import { Changeset } from '../../src/changeset/models/changeset';

const MAX_GENERATED_FAKES = 1000;
const MIN_GENERATED_FAKES = 1;

export type FakeSyncParams = Partial<Sync>;

export const createFakeSync = (params: FakeSyncParams = {}): Sync => {
  return {
    id: params.id ?? faker.datatype.uuid(),

    dumpDate: params.dumpDate ?? faker.datatype.datetime(),

    startDate: params.startDate ?? faker.datatype.datetime(),

    status: params.status ?? Status.IN_PROGRESS,

    layerId: params.layerId ?? faker.datatype.number(),

    isFull: params.isFull ?? faker.datatype.boolean(),

    totalFiles: params.totalFiles ?? faker.datatype.number(),

    geometryType: params.geometryType ?? GeometryType.POLYGON,

    runNumber: params.runNumber ?? 0,

    baseSyncId: params.baseSyncId ?? null,
  };
};

export const createMultipleSyncData = (amount: number): Sync[] => {
  const data: Sync[] = [];
  for (let i = 0; i < amount; i++) {
    data.push(createFakeSync());
  }
  return data;
};

export const createFakeRerunSync = (params: FakeSyncParams = {}): Sync => {
  return {
    id: params.id ?? faker.datatype.uuid(),

    dumpDate: params.dumpDate ?? faker.datatype.datetime(),

    startDate: params.startDate ?? faker.datatype.datetime(),

    status: params.status ?? Status.IN_PROGRESS,

    layerId: params.layerId ?? faker.datatype.number(),

    isFull: params.isFull ?? faker.datatype.boolean(),

    totalFiles: params.totalFiles ?? faker.datatype.number(),

    geometryType: params.geometryType ?? GeometryType.POLYGON,

    runNumber: params.runNumber ?? faker.datatype.number({ min: 1 }),

    baseSyncId: params.baseSyncId ?? faker.datatype.uuid(),
  };
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

export const createFakeFiles = (quantity: number = faker.datatype.number({ max: MAX_GENERATED_FAKES, min: MIN_GENERATED_FAKES })): File[] => {
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

export const createFakeEntities = (quantity: number = faker.datatype.number({ max: MAX_GENERATED_FAKES, min: MIN_GENERATED_FAKES })): Entity[] => {
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
