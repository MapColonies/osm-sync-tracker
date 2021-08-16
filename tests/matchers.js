expect.extend({
  toHaveStatus: (response, status) => {
    if (response?.status !== status) {
      return {
        message: () => `expected response.status to match ${status}`,
        pass: false,
      };
    }
    return { pass: true };
  },
});
