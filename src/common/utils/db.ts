import config from 'config';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { TransactionRetryPolicy } from '../interfaces';

export function getIsolationLevel(): IsolationLevel {
  return config.get<IsolationLevel>('application.isolationLevel');
}

export function getTransactionRetryPolicy(): TransactionRetryPolicy {
  return config.get<TransactionRetryPolicy>('application.transactionRetryPolicy');
}
