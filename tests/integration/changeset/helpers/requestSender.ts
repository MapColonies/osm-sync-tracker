import * as supertest from 'supertest';
import { Application } from 'express';
import { DependencyContainer } from 'tsyringe';
import { ServerBuilder } from '../../../../src/serverBuilder';
import { changesetRepositorySymbol } from '../../../../src/changeset/DAL/changsetRepository';
import { StringifiedSync } from '../types';

export function getApp(container: DependencyContainer): Application {
  return container.resolve(ServerBuilder).build();
}

export function getMockedRepoApp(container: DependencyContainer, repo: unknown): Application {
  container.register(changesetRepositorySymbol, { useValue: repo });
  const builder = container.resolve<ServerBuilder>(ServerBuilder);
  return builder.build();
}

export async function postChangeset(app: Application, body: StringifiedSync): Promise<supertest.Response> {
  return supertest.agent(app).post(`/changeset`).set('Content-Type', 'application/json').send(body);
}

export async function patchChangeset(app: Application, changesetId: string, body: Omit<StringifiedSync, 'changesetId'>): Promise<supertest.Response> {
  return supertest.agent(app).patch(`/changeset/${changesetId}`).set('Content-Type', 'application/json').send(body);
}

export async function putChangeset(app: Application, changesetId: string): Promise<supertest.Response> {
  return supertest.agent(app).put(`/changeset/${changesetId}/close`).set('Content-Type', 'application/json');
}
