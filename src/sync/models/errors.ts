export class SyncAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SyncAlreadyExistsError.prototype);
  }
}

export class SyncNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SyncNotFoundError.prototype);
  }
}
