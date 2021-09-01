declare global {
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R> {
      toHaveStatus: (status: number) => CustomMatcherResult;
      toHavePropertyThatContains: (property: string, value: string) => CustomMatcherResult;
    }
  }
}

export {};
