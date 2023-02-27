import { CamelCasedProperties, SnakeCasedProperties } from 'type-fest';
import { camelCase, snakeCase } from 'lodash';

type Cased<T> = SnakeCasedProperties<T> | CamelCasedProperties<T>;
type CaseConvertFn = (input?: string) => string;
type Case = 'snake' | 'camel';

export const convertObjectToCased = <T extends Record<string, unknown>>(obj: T, caseType: Case): Cased<T> => {
  const keyValues = Object.entries(obj);

  let casedObject = {};

  const fn: CaseConvertFn = caseType === 'snake' ? snakeCase : camelCase;

  for (const [key, value] of keyValues) {
    casedObject = { ...casedObject, [fn(key)]: value };
  }

  return casedObject as Cased<T>;
};
