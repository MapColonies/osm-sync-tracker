import config from 'config';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

export function getIsolationLevel(): IsolationLevel {
  return config.get<IsolationLevel>('application.isolationLevel');
}
