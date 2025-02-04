export interface HttpError extends Error {
  status?: number;
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
