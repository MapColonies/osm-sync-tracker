import { DataSourceOptions } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface TransactionRetryPolicy {
  enabled: boolean;
  numRetries?: number;
}

export interface IApplication {
  isolationLevel: IsolationLevel;
  transactionRetryPolicy: TransactionRetryPolicy;
  featureFlags?: {
    closeFileCron: boolean;
  };
}

export interface IServerConfig {
  port: string;
}

export type DbConfig = {
  enableSslAuth: boolean;
  sslPaths: { ca: string; cert: string; key: string };
} & DataSourceOptions;

export interface OpenApiConfig {
  filePath: string;
  basePath: string;
  jsonPath: string;
  uiPath: string;
}
