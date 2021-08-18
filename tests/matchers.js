expect.extend({
  toHaveStatus: (response, status) => {
    if (response !== undefined && response.status == status) {
      return { pass: true };
    }
    return {
      message: () => `expected response.status to match ${status}`,
      pass: false,
    };
  },
});
