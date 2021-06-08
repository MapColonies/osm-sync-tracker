import * as supertest from 'supertest';
import { Application } from 'express';
import { DependencyContainer } from 'tsyringe';
import { ServerBuilder } from '../../../../src/serverBuilder';
import { fileRepositorySymbol } from '../../../../src/file/DAL/fileRepository';
import { StringifiedFile } from '../types';

export function getApp(container: DependencyContainer): Application {
  return container.resolve(ServerBuilder).build();
}

export function getMockedRepoApp(container: DependencyContainer, repo: unknown): Application {
  container.register(fileRepositorySymbol, { useValue: repo });
  const builder = container.resolve<ServerBuilder>(ServerBuilder);
  return builder.build();
}

export async function postFile(app: Application, syncId: string, body: StringifiedFile): Promise<supertest.Response> {
  return supertest.agent(app).post(`/sync/${syncId}/file`).set('Content-Type', 'application/json').send(body);
}

export async function postFileBulk(app: Application, syncId: string, body: StringifiedFile[]): Promise<supertest.Response> {
  return supertest.agent(app).post(`/sync/${syncId}/file/_bulk`).set('Content-Type', 'application/json').send(body);
}
