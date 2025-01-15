import { EntityManager, QueryFailedError } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

export enum TransactionFailure {
  SERIALIZATION_FAILURE = '40001',
  DEADLOCK_DETECTED = '40P01',
}

export interface QueryFailedErrorWithCode extends QueryFailedError {
  code: string | undefined;
}

export type TransactionFn<T> = (entityManager: EntityManager) => Promise<T>;

export interface TransactionParams {
  transactionId?: string;
  transactionName?: TransactionName;
  isolationLevel: IsolationLevel;
}

export enum TransactionName {
  CREATE_RERUN = 'CreateRerun',
  ATTEMPT_FILE_CLOSURE = 'AttemptFileClosure',
  ATTEMPT_SYNC_CLOSURE = 'AttemptSyncClosure',
  FIND_FILES_BY_CHANGESETS = 'FindFilesByChangesets',
}

export const isTransactionFailure = (error: unknown): boolean => {
  if (error instanceof QueryFailedError) {
    const code = (error as QueryFailedErrorWithCode).code;
    return code === TransactionFailure.SERIALIZATION_FAILURE || code === TransactionFailure.DEADLOCK_DETECTED;
  }
  return false;
};
