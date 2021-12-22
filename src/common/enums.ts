export enum Status {
  IN_PROGRESS = 'inprogress',
  COMPLETED = 'completed',
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
}

export enum GeometryType {
  POINT = 'point',
  LINE = 'line',
  POLY = 'poly',
}
