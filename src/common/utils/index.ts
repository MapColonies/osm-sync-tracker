import { createHash } from 'crypto';
import { CamelCasedProperties, SnakeCasedProperties } from 'type-fest';
import { camelCase, snakeCase, transform } from 'lodash';

type Cased<T> = SnakeCasedProperties<T> | CamelCasedProperties<T>;
type CaseConvertFn = (input?: string) => string;
type Case = 'snake' | 'camel';

export const convertObjectToCased = <T extends Record<string, unknown>>(obj: T, caseType: Case): Cased<T> => {
  const fn: CaseConvertFn = caseType === 'snake' ? snakeCase : camelCase;

  const casedObject = transform(
    obj,
    (result: Record<string, unknown>, value: unknown, key: string) => {
      result[fn(key)] = value;
    },
    {}
  );

  return casedObject as Cased<T>;
};

export const hashBatch = (input: string[]): string => {
  const sortedJoinedInput = input.sort((a, b) => a.localeCompare(b)).join('');

  return createHash('sha256').update(sortedJoinedInput).digest('hex');
};

export const randomIntFromInterval = (min: number, max: number): number => {
  return min !== max ? Math.random() * (max - min + 1) + min : min;
};
