import { DependencyContainer } from 'tsyringe';
import { DataSource } from 'typeorm';
import { StringifiedSync } from '../sync/types';
import { SyncRequestSender } from '../sync/helpers/requestSender';
import { FileRequestSender } from '../file/helpers/requestSender';
import { EntityRequestSender } from '../entity/helpers/requestSender';
import { StringifiedFile } from '../file/types';
import { BEFORE_ALL_TIMEOUT, getBaseRegisterOptions } from '../helpers';
import httpStatusCodes from 'http-status-codes';
import { getApp } from '../../../src/app';
import { DocsRequestSender } from './helpers/docsRequestSender';

describe('docs', function () {
  let requestSender: DocsRequestSender;

  let depContainer: DependencyContainer;

  beforeAll(async function () {
    const { app, container } = await getApp(getBaseRegisterOptions());
    depContainer = container;
    requestSender = new DocsRequestSender(app);
  }, BEFORE_ALL_TIMEOUT);

  afterAll(async function () {
    const connection = depContainer.resolve(DataSource);
    await connection.destroy();
    depContainer.reset();
  });

  describe('Happy Path', function () {
    it('should return 200 status code and the resource', async function () {
      const response = await requestSender.getDocs();

      expect(response.status).toBe(httpStatusCodes.OK);
      expect(response.type).toBe('text/html');
    });

    it('should return 200 status code and the json spec', async function () {
      const response = await requestSender.getDocsJson();

      expect(response.status).toBe(httpStatusCodes.OK);

      expect(response.type).toBe('application/json');
      expect(response.body).toHaveProperty('openapi');
    });
  });
});
