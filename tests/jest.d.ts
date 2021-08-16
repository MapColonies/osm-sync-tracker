declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveStatus: (status: number) => CustomMatcherResult;
    }
  }
}

export {};
