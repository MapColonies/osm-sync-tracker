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
  toHavePropertyThatContains: (object, property, value) => {
    if (object !== undefined && object[property] !== undefined && object[property].includes(value)) {
      return { pass: true };
    }
    return {
      message: () => `expected ${object}.${property} to contain ${value}`,
      pass: false,
    };
  },
});
