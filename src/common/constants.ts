import { readPackageJsonSync } from '@map-colonies/read-pkg';

export const SERVICE_NAME = readPackageJsonSync().name ?? 'unknown_service';

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES: Record<string, symbol> = {
  LOGGER: Symbol('LOGGER'),
  CONFIG: Symbol('CONFIG'),
  TRACER: Symbol('TRACER'),
  METRICS: Symbol('METRICS'),
  CLEANUP_REGISTRY: Symbol('CLEANUP_REGISTRY'),
  REDIS: Symbol('REDIS'),
};
/* eslint-enable @typescript-eslint/naming-convention */

export const ON_SIGNAL = Symbol('onSignal');
export const HEALTHCHECK = Symbol('healthcheck');
