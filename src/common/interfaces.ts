import { ConnectionOptions } from 'typeorm';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface TransactionRetryPolicy {
  enabled: boolean;
  amount?: number;
}

export interface IApplication {
  transactionRetryPolicy: TransactionRetryPolicy;
}

export interface IServerConfig {
  port: string;
}

export type DbConfig = {
  enableSslAuth: boolean;
  sslPaths: { ca: string; cert: string; key: string };
} & ConnectionOptions;

export interface OpenApiConfig {
  filePath: string;
  basePath: string;
  jsonPath: string;
  uiPath: string;
}
