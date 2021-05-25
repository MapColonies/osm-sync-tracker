export class FileAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, FileAlreadyExistsError.prototype);
  }
}
