import { EntityManager, QueryFailedError } from 'typeorm';

enum TransactionFailure {
  SERIALIZATION_FAILURE = '40001',
  DEADLOCK_DETECTED = '40P01',
}

interface QueryFailedErrorWithCode extends QueryFailedError {
  code: string | undefined;
}

export type TransactionFn<T> = (entityManager: EntityManager) => Promise<T>;

export enum TransactionName {
  TRY_CLOSING_FILE = 'TryClosingFile',
  CREATE_RERUN = 'CreateRerun',
  TRY_CLOSING_CHANGESET = 'TryClosingChangeset',
  TRY_CLOSING_CHANGESETS = 'TryClosingChangesets',
}

export const isTransactionFailure = (error: unknown): boolean => {
  if (error instanceof QueryFailedError) {
    const code = (error as QueryFailedErrorWithCode).code;
    return code === TransactionFailure.SERIALIZATION_FAILURE || code === TransactionFailure.DEADLOCK_DETECTED;
  }
  return false;
};
