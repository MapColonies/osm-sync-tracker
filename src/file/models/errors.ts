import { StatusCodes } from 'http-status-codes';
import { HttpError } from '../../common/errors';

export class FileAlreadyExistsError extends Error implements HttpError {
  public constructor(message: string, public readonly status = StatusCodes.CONFLICT) {
    super(message);
    Object.setPrototypeOf(this, FileAlreadyExistsError.prototype);
  }
}

export class FileNotFoundError extends Error implements HttpError {
  public constructor(message: string, public readonly status = StatusCodes.NOT_FOUND) {
    super(message);
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}
