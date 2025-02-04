import { QueryFailedError } from 'typeorm';
import { IsolationLevel as IsolationLevelEnum, Propagation, runInTransaction } from 'typeorm-transactional';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { TransactionFailureError } from '../errors';
import { ILogger } from '../interfaces';

const isolationLevelConverter = (str: IsolationLevel): IsolationLevelEnum => {
  switch (str) {
    case 'READ COMMITTED':
      return IsolationLevelEnum.READ_COMMITTED;
    case 'READ UNCOMMITTED':
      return IsolationLevelEnum.READ_UNCOMMITTED;
    case 'REPEATABLE READ':
      return IsolationLevelEnum.REPEATABLE_READ;
    case 'SERIALIZABLE':
      return IsolationLevelEnum.SERIALIZABLE;
  }
};

export const DEFAULT_TRANSACTION_PROPAGATION = Propagation.REQUIRED;

export enum TransactionFailure {
  SERIALIZATION_FAILURE = '40001',
  DEADLOCK_DETECTED = '40P01',
}

export interface QueryFailedErrorWithCode extends QueryFailedError {
  code: string | undefined;
}

export interface TransactionParams {
  transactionId?: string;
  transactionName?: TransactionName;
  isolationLevel: IsolationLevel;
  propagation: Propagation;
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

export const transactionify = async <T>(params: TransactionParams, fn: () => Promise<T>, logger?: ILogger): Promise<T> => {
  logger?.info({ msg: 'attempting to run transaction', ...params });

  try {
    const result = await runInTransaction(fn, { isolationLevel: isolationLevelConverter(params.isolationLevel), propagation: params.propagation });

    logger?.info({ msg: 'transaction completed', ...params });

    return result;
  } catch (error) {
    logger?.error({ msg: 'failure occurred while running transaction', ...params, err: error });

    if (isTransactionFailure(error)) {
      throw new TransactionFailureError(`running transaction has failed due to read/write dependencies among transactions.`);
    }

    throw error;
  }
};
