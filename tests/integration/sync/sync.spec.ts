import httpStatus from 'http-status-codes';
import { container } from 'tsyringe';
import { Application } from 'express';
import { createFakeSync } from '../../helpers/helper';
import { registerTestValues } from '../testContainerConfig';
import * as requestSender from './helpers/requestSender';

describe('sync', function () {
  let app: Application;
  beforeAll(async function () {
    await registerTestValues();
    app = requestSender.getApp();
  });
  afterAll(function () {
    container.clearInstances();
  });

  describe('Happy Path', function () {
    it('should return 201 status code and Created body', async function () {
      const body = createFakeSync();
      const response = await requestSender.postSync(app, body);

      expect(response.status).toBe(httpStatus.CREATED);
      expect(response.text).toBe(httpStatus.getStatusText(httpStatus.CREATED));
    });

    it('should return 200 status code and OK body', async function () {
      const body = createFakeSync();
      await requestSender.postSync(app, body);
      const { id, ...updateBody } = body;
      const response = await requestSender.patchSync(app, id, updateBody);

      expect(response.status).toBe(httpStatus.OK);
      expect(response.text).toBe(httpStatus.getStatusText(httpStatus.OK));
    });

    it('should return 200 status code and the sync entity', async function () {
      const body = createFakeSync();
      await requestSender.postSync(app, body);
      const { layerId } = body;
      const response = await requestSender.getLatestSync(app, layerId);

      expect(response.status).toBe(httpStatus.OK);
      expect(response.body).toEqual(body);
    });
  });

  describe('Bad Path', function () {
    // All requests with status code of 400
  });
  describe('Sad Path', function () {
    // All requests with status code 4XX-5XX
  });
});
