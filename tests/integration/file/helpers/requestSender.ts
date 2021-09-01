import * as supertest from 'supertest';
import { Application } from 'express';
import { StringifiedFile } from '../types';

export class FileRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async postFile(syncId: string, body: StringifiedFile): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/sync/${syncId}/file`).set('Content-Type', 'application/json').send(body);
  }

  public async postFileBulk(syncId: string, body: StringifiedFile[]): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/sync/${syncId}/file/_bulk`).set('Content-Type', 'application/json').send(body);
  }
}

// export function getMockedRepoApp(container: DependencyContainer, repo: unknown): Application {
//   container.register(fileRepositorySymbol, { useValue: repo });
//   const builder = container.resolve<ServerBuilder>(ServerBuilder);
//   return builder.build();
// }
