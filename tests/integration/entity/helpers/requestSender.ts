import * as supertest from 'supertest';
import { Application } from 'express';
import { DependencyContainer } from 'tsyringe';
import { ServerBuilder } from '../../../../src/serverBuilder';
import { entityRepositorySymbol } from '../../../../src/entity/DAL/entityRepository';
import { StringifiedEntity } from './generators';

export function getApp(container: DependencyContainer): Application {
  return container.resolve(ServerBuilder).build();
}

export function getMockedRepoApp(container: DependencyContainer, repo: unknown): Application {
  container.register(entityRepositorySymbol, { useValue: repo });
  const builder = container.resolve<ServerBuilder>(ServerBuilder);
  return builder.build();
}

export async function postEntity(app: Application, fileId: string, body: StringifiedEntity): Promise<supertest.Response> {
  return supertest.agent(app).post(`/file/${fileId}/entity`).set('Content-Type', 'application/json').send(body);
}

export async function postEntityBulk(app: Application, fileId: string, body: StringifiedEntity[]): Promise<supertest.Response> {
  return supertest.agent(app).post(`/file/${fileId}/entity/_bulk`).set('Content-Type', 'application/json').send(body);
}

export async function patchEntity(
  app: Application,
  fileId: string,
  entityId: string,
  body: Omit<StringifiedEntity, 'entityId'>
): Promise<supertest.Response> {
  return supertest.agent(app).patch(`/file/${fileId}/entity/${entityId}`).set('Content-Type', 'application/json').send(body);
}
