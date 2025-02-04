import { faker } from '@faker-js/faker';
import { ActionType, EntityStatus, GeometryType, Status } from '../../src/common/enums';
import { Sync } from '../../src/sync/models/sync';
import { File } from '../../src/file/models/file';
import { Entity } from '../../src/entity/models/entity';
import { Changeset } from '../../src/changeset/models/changeset';

const MIN_GENERATED_FAKES = 1;
const MAX_GENERATED_FAKES = 1000;

const previouslyGeneratedNumbers = new Set<number>();

export const MAX_RANDOM_NUMERIC_VALUE = 99999;

export const generateUniqueNumber = (): number => {
  let number: number;
  do {
    number = faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE });
  } while (previouslyGeneratedNumbers.has(number));

  previouslyGeneratedNumbers.add(number);

  return number;
};

export type FakeSyncParams = Partial<Sync>;

export const createFakeSync = (params: FakeSyncParams = {}): Sync => {
  return {
    id: params.id ?? faker.string.uuid(),

    dumpDate: params.dumpDate ?? faker.date.anytime(),

    startDate: params.startDate ?? faker.date.anytime(),

    status: params.status ?? Status.IN_PROGRESS,

    layerId: params.layerId ?? generateUniqueNumber(),

    isFull: params.isFull ?? faker.datatype.boolean(),

    totalFiles: params.totalFiles ?? faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE }),

    geometryType: params.geometryType ?? GeometryType.POLYGON,

    runNumber: params.runNumber ?? 0,

    baseSyncId: params.baseSyncId ?? null,

    metadata: params.metadata ?? null,
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
    id: params.id ?? faker.string.uuid(),

    dumpDate: params.dumpDate ?? faker.date.anytime(),

    startDate: params.startDate ?? faker.date.anytime(),

    status: params.status ?? Status.IN_PROGRESS,

    layerId: params.layerId ?? generateUniqueNumber(),

    isFull: params.isFull ?? faker.datatype.boolean(),

    totalFiles: params.totalFiles ?? faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE }),

    geometryType: params.geometryType ?? GeometryType.POLYGON,

    runNumber: params.runNumber ?? faker.number.int({ min: 1, max: MAX_RANDOM_NUMERIC_VALUE }),

    baseSyncId: params.baseSyncId ?? faker.string.uuid(),

    metadata: params.metadata ?? null,
  };
};

export const createFakeFile = (): File => {
  return {
    fileId: faker.string.uuid(),

    syncId: faker.string.uuid(),

    totalEntities: faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE }),

    startDate: faker.date.anytime(),

    endDate: undefined,

    status: Status.IN_PROGRESS,
  };
};

export const createFakeFiles = (quantity: number = faker.number.int({ min: MIN_GENERATED_FAKES, max: MAX_GENERATED_FAKES })): File[] => {
  const files: File[] = [];
  for (let i = 0; i < quantity; i++) {
    files.push(createFakeFile());
  }
  return files;
};

export const createFakeEntity: () => Entity = () => {
  return {
    entityId: faker.string.uuid(),

    fileId: faker.string.uuid(),

    changesetId: faker.string.uuid(),

    status: EntityStatus.IN_PROGRESS,

    action: ActionType.CREATE,
  };
};

export const createFakeEntities = (quantity: number = faker.number.int({ min: MIN_GENERATED_FAKES, max: MAX_GENERATED_FAKES })): Entity[] => {
  const entities: Entity[] = [];
  for (let i = 0; i < quantity; i++) {
    entities.push(createFakeEntity());
  }
  return entities;
};

export const createFakeChangeset: () => Changeset = () => {
  return {
    changesetId: faker.string.uuid(),

    osmId: faker.number.int({ max: MAX_RANDOM_NUMERIC_VALUE }),
  };
};
