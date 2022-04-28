export class FileAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, FileAlreadyExistsError.prototype);
  }
}

export class DuplicateFilesError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, DuplicateFilesError.prototype);
  }
}

export class FileNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}

export class ConflictingRerunFileError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ConflictingRerunFileError.prototype);
  }
}
