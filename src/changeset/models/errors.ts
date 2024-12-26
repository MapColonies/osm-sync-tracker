export class ChangesetAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ChangesetAlreadyExistsError.prototype);
  }
}

export class ChangesetNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ChangesetNotFoundError.prototype);
  }
}
