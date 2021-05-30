import { StatusCodes } from 'http-status-codes';
import { HttpError } from '../../common/errors';

export class SyncAlreadyExistsError extends Error implements HttpError {
  public constructor(message: string, public readonly status = StatusCodes.CONFLICT) {
    super(message);
    Object.setPrototypeOf(this, SyncAlreadyExistsError.prototype);
  }
}

export class SyncNotFoundError extends Error implements HttpError {
  public constructor(message: string, public readonly status = StatusCodes.NOT_FOUND) {
    super(message);
    Object.setPrototypeOf(this, SyncNotFoundError.prototype);
  }
}
