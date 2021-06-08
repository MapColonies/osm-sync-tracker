import { ConnectionOptions } from 'typeorm';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
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
