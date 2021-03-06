export enum Status {
  IN_PROGRESS = 'inprogress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ActionType {
  CREATE = 'create',
  MODIFY = 'modify',
  DELTE = 'delete',
}

export enum EntityStatus {
  IN_PROGRESS = 'inprogress',
  COMPLETED = 'completed',
  NOT_SYNCED = 'not_synced',
  FAILED = 'failed',
  IN_RERUN = 'inrerun',
}

export enum GeometryType {
  POINT = 'point',
  LINESTRING = 'linestring',
  POLYGON = 'polygon',
}
