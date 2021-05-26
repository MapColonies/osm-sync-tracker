export class FileAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, FileAlreadyExistsError.prototype);
  }
}

export class FileNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}
