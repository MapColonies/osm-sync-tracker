import * as supertest from 'supertest';
import { Application } from 'express';
import { container } from 'tsyringe';
import { ServerBuilder } from '../../../../src/serverBuilder';
import { StringifiedSync } from '../types';
import { syncRepositorySymbol } from '../../../../src/sync/DAL/syncRepository';

export function getApp(): Application {
  return container.resolve(ServerBuilder).build();
}

export function getMockedRepoApp(repo: unknown): Application {
  container.register(syncRepositorySymbol, { useValue: repo });
  const builder = container.resolve<ServerBuilder>(ServerBuilder);
  return builder.build();
}

export async function postSync(app: Application, body: StringifiedSync): Promise<supertest.Response> {
  return supertest.agent(app).post('/sync').set('Content-Type', 'application/json').send(body);
}

export async function patchSync(app: Application, syncId: string, body: Omit<StringifiedSync, 'id'>): Promise<supertest.Response> {
  return supertest.agent(app).patch(`/sync/${syncId}`).set('Content-Type', 'application/json').send(body);
}

export async function getLatestSync(app: Application, layerId: number): Promise<supertest.Response> {
  return supertest.agent(app).get(`/sync/latest`).query({ layerId: layerId });
}
