import { hostname } from 'os';
import { readPackageJsonSync } from '@map-colonies/read-pkg';

export const SERVICE_NAME = readPackageJsonSync().name ?? 'unknown_service';
export const HOSTNAME = hostname();
export const DEFAULT_SERVER_PORT = 80;

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/, /^.*\/metrics.*/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES: Record<string, symbol> = {
  LOGGER: Symbol('LOGGER'),
  CONFIG: Symbol('CONFIG'),
  TRACER: Symbol('TRACER'),
  METER: Symbol('METER'),
  APPLICATION: Symbol('APPLICATION'),
};
/* eslint-enable @typescript-eslint/naming-convention */

export const ON_SIGNAL = Symbol('onSignal');
export const HEALTHCHECK = Symbol('healthcheck');
export const DB_SCHEMA = Symbol('db.schema');
export const METRICS_REGISTRY = Symbol('MetricsRegistry');
