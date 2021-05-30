import { StatusCodes } from 'http-status-codes';
import { HttpError } from '../../common/errors';

export class ChangesetAlreadyExistsError extends Error implements HttpError {
  public constructor(message: string, public readonly status = StatusCodes.CONFLICT) {
    super(message);
    Object.setPrototypeOf(this, ChangesetAlreadyExistsError.prototype);
  }
}

export class ChangesetNotFoundError extends Error implements HttpError {
  public constructor(message: string, public readonly status = StatusCodes.NOT_FOUND) {
    super(message);
    Object.setPrototypeOf(this, ChangesetNotFoundError.prototype);
  }
}
