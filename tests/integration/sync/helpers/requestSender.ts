import * as supertest from 'supertest';
import { StringifiedSync } from '../types';

export class SyncRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async postSync(body: StringifiedSync): Promise<supertest.Response> {
    return supertest.agent(this.app).post('/sync').set('Content-Type', 'application/json').send(body);
  }

  public async patchSync(syncId: string, body: Omit<StringifiedSync, 'id'>): Promise<supertest.Response> {
    return supertest.agent(this.app).patch(`/sync/${syncId}`).set('Content-Type', 'application/json').send(body);
  }

  public async getLatestSync(layerId: number): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/sync/latest`).query({ layerId: layerId });
  }
}

// export function getMockedRepoApp(container: DependencyContainer, repo: unknown): Application {
//   container.register(syncRepositorySymbol, { useValue: repo });
//   const builder = container.resolve<ServerBuilder>(ServerBuilder);
//   return builder.build();
// }
