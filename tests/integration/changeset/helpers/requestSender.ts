import * as supertest from 'supertest';
import { Application } from 'express';
import { StringifiedSync } from '../types';

export class ChangesetRequestSender {
  public constructor(private readonly app: Application) {}

  public async postChangeset(body: StringifiedSync): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/changeset`).set('Content-Type', 'application/json').send(body);
  }

  public async patchChangeset(changesetId: string, body: Omit<StringifiedSync, 'changesetId'>): Promise<supertest.Response> {
    return supertest.agent(this.app).patch(`/changeset/${changesetId}`).set('Content-Type', 'application/json').send(body);
  }

  public async patchChangesetEntities(changesetId: string): Promise<supertest.Response> {
    return supertest.agent(this.app).patch(`/changeset/${changesetId}/entities`).set('Content-Type', 'application/json');
  }

  public async postChangesetClosure(changesetIds: string[]): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/changeset/closure`).set('Content-Type', 'application/json').send(changesetIds);
  }
}
