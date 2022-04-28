export class SyncAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SyncAlreadyExistsError.prototype);
  }
}

export class FullSyncAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, FullSyncAlreadyExistsError.prototype);
  }
}

export class RerunAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, RerunAlreadyExistsError.prototype);
  }
}

export class SyncNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SyncNotFoundError.prototype);
  }
}

export class InvalidSyncForRerunError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, InvalidSyncForRerunError.prototype);
  }
}
