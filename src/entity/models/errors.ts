export class EntityAlreadyExistsError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, EntityAlreadyExistsError.prototype);
  }
}

export class EntityNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, EntityNotFoundError.prototype);
  }
}
