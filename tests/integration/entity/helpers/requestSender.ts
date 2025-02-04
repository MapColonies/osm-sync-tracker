import * as supertest from 'supertest';
import { Application } from 'express';
import { StringifiedEntity } from './generators';

export class EntityRequestSender {
  public constructor(private readonly app: Application) {}

  public async postEntity(fileId: string, body: StringifiedEntity): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/file/${fileId}/entity`).set('Content-Type', 'application/json').send(body);
  }

  public async postEntityBulk(fileId: string, body: StringifiedEntity[]): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/file/${fileId}/entity/_bulk`).set('Content-Type', 'application/json').send(body);
  }

  public async patchEntity(fileId: string, entityId: string, body: Omit<StringifiedEntity, 'entityId'>): Promise<supertest.Response> {
    return supertest.agent(this.app).patch(`/file/${fileId}/entity/${entityId}`).set('Content-Type', 'application/json').send(body);
  }

  public async patchEntities(body: StringifiedEntity[]): Promise<supertest.Response> {
    return supertest.agent(this.app).patch(`/entity/_bulk`).set('Content-Type', 'application/json').send(body);
  }
}
