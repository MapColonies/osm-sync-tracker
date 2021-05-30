import * as supertest from 'supertest';
import { Application } from 'express';
import { container } from 'tsyringe';
import { ServerBuilder } from '../../../../src/serverBuilder';
import { Sync } from '../../../../src/sync/models/sync';

export function getApp(): Application {
  return container.resolve(ServerBuilder).build();
}

export async function postSync(app: Application, body: Sync): Promise<supertest.Response> {
  return supertest.agent(app).post('/sync').set('Content-Type', 'application/json').send(body);
}

export async function patchSync(app: Application, syncId: string, body: Omit<Sync, 'id'>): Promise<supertest.Response> {
  return supertest.agent(app).patch(`/sync/${syncId}`).set('Content-Type', 'application/json').send(body);
}

export async function getLatestSync(app: Application, layerId: number): Promise<supertest.Response> {
  return supertest.agent(app).get(`/sync/latest`).query({ layerId: layerId });
}
