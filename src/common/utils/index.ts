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
