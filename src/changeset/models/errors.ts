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

export class TransactionFailureError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, TransactionFailureError.prototype);
  }
}

export class ExceededNumberOfRetriesError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ExceededNumberOfRetriesError.prototype);
  }
}
