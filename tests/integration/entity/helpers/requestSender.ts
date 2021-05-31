import * as supertest from 'supertest';
import { Application } from 'express';
import { container } from 'tsyringe';
import { ServerBuilder } from '../../../../src/serverBuilder';
import { Entity } from '../../../../src/entity/models/entity';
import { entityRepositorySymbol } from '../../../../src/entity/DAL/entityRepository';

export function getApp(): Application {
  return container.resolve(ServerBuilder).build();
}

export function getMockedRepoApp(repo: unknown): Application {
  container.register(entityRepositorySymbol, { useValue: repo });
  const builder = container.resolve<ServerBuilder>(ServerBuilder);
  return builder.build();
}

export async function postEntity(app: Application, fileId: string, body: Entity): Promise<supertest.Response> {
  return supertest.agent(app).post(`/file/${fileId}/entity`).set('Content-Type', 'application/json').send(body);
}

export async function postEntityBulk(app: Application, fileId: string, body: Entity[]): Promise<supertest.Response> {
  return supertest.agent(app).post(`/file/${fileId}/entity/_bulk`).set('Content-Type', 'application/json').send(body);
}

export async function patchEntity(app: Application, fileId: string, entityId: Entity, body: Omit<Entity, 'fileId'>): Promise<supertest.Response> {
  return supertest.agent(app).patch(`/file/${fileId}/entity`).set('Content-Type', 'application/json').send(body);
}
