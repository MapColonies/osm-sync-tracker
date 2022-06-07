import * as supertest from 'supertest';
import { FileUpdate } from '../../../../src/file/models/file';
import { StringifiedFile } from '../types';

export class FileRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async postFile(syncId: string, body: StringifiedFile): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/sync/${syncId}/file`).set('Content-Type', 'application/json').send(body);
  }

  public async patchFile(syncId: string, fileId: string, body: FileUpdate): Promise<supertest.Response> {
    return supertest.agent(this.app).patch(`/sync/${syncId}/file/${fileId}`).set('Content-Type', 'application/json').send(body);
  }

  public async postFileBulk(syncId: string, body: StringifiedFile[]): Promise<supertest.Response> {
    return supertest.agent(this.app).post(`/sync/${syncId}/file/_bulk`).set('Content-Type', 'application/json').send(body);
  }
}
