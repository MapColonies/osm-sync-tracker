import { constructor } from 'tsyringe/dist/typings/types';
import { ExceededNumberOfRetriesError } from '../../changeset/models/errors';

interface RetryOptions<E extends constructor<Error>> {
  numberOfRetries: number;
  retryErrorType: E;
}

export const retryFunctionWrapper = async <A extends unknown[], F extends (...args: A) => Awaited<unknown>, E extends constructor<Error>>(
  options: RetryOptions<E>,
  func: F,
  ...args: A
): Promise<ReturnType<F>> => {
  for (let i = 0; i <= options.numberOfRetries; i++) {
    try {
      return (await func(...args)) as ReturnType<F>;
    } catch (error) {
      if (!(error instanceof options.retryErrorType)) {
        throw error;
      }
    }
  }
  throw new ExceededNumberOfRetriesError(`${func.name} exceeded the number of retries (${options.numberOfRetries}).`);
};
