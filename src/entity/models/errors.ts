import { StatusCodes } from 'http-status-codes';
import { HttpError } from '../../common/errors';

export class EntityAlreadyExistsError extends Error implements HttpError {
  public constructor(message: string, public readonly status = StatusCodes.CONFLICT) {
    super(message);
    Object.setPrototypeOf(this, EntityAlreadyExistsError.prototype);
  }
}

export class EntityNotFoundError extends Error {
  public constructor(message: string, public readonly status = StatusCodes.NOT_FOUND) {
    super(message);
    Object.setPrototypeOf(this, EntityNotFoundError.prototype);
  }
}
