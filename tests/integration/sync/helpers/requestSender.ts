import * as supertest from 'supertest';
import { GeometryType } from '../../../../src/common/enums';
import { StringifiedRerunCreateBody, StringifiedSync } from '../types';

export class SyncRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async postSync(body: StringifiedSync): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/sync').set('Content-Type', 'application/json').send(body);
  }

  public async patchSync(syncId: string, body: Omit<StringifiedSync, 'id' | 'isFull'>): Promise<supertest.Response> {
    return supertest.agent(this.app).patch(`/sync/${syncId}`).set('Content-Type', 'application/json').send(body);
  }

  public async getLatestSync(layerId: number, geometryType: GeometryType): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/sync/latest`).query({ layerId, geometryType });
  }

  public async rerunSync(syncId: string, body: StringifiedRerunCreateBody): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/sync/${syncId}/rerun`).set('Content-Type', 'application/json').send(body);
  }
}
