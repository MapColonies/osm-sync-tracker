import * as supertest from 'supertest';
import { Application } from 'express';
import { GeometryType } from '../../../../src/common/enums';
import { convertObjectToCased } from '../../../../src/common/utils';
import { SyncsFilter } from '../../../../src/sync/models/sync';
import { StringifiedRerunCreateBody, StringifiedSync } from '../types';

export class SyncRequestSender {
  public constructor(private readonly app: Application) {}

  public async postSync(body: StringifiedSync): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/sync').set('Content-Type', 'application/json').send(body);
  }

  public async patchSync(syncId: string, body: Omit<StringifiedSync, 'id' | 'isFull'>): Promise<supertest.Response> {
    return supertest.agent(this.app).patch(`/sync/${syncId}`).set('Content-Type', 'application/json').send(body);
  }

  public async getSyncs(filter: Partial<SyncsFilter>): Promise<supertest.Response> {
    const snakeCasedFilter = convertObjectToCased(filter, 'snake');
    return supertest.agent(this.app).get(`/sync`).query(snakeCasedFilter);
  }

  public async getLatestSync(layerId: number, geometryType: GeometryType): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/sync/latest`).query({ layerId, geometryType });
  }

  public async postSyncsClosure(syncIds: string[]): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/sync/closure`).set('Content-Type', 'application/json').send(syncIds);
  }

  public async rerunSync(syncId: string, body: StringifiedRerunCreateBody): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/sync/${syncId}/rerun`).set('Content-Type', 'application/json').send(body);
  }
}
