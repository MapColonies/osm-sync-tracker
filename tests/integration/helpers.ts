import { Response } from 'supertest';

export const expectResponseStatusCode = (response: Response, status: number): void => {
  expect(response).toHaveProperty('status', status);
};
