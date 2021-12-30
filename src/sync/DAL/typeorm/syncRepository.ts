import { EntityRepository, Repository } from 'typeorm';
import { GeometryType } from '../../../common/enums';
import { Sync, SyncUpdate } from '../../models/sync';
import { ISyncRepository } from '../syncRepository';
import { SyncDb as DbSync } from './sync';

@EntityRepository(DbSync)
export class SyncRepository extends Repository<DbSync> implements ISyncRepository {
  public async getLatestSync(layerId: number, geometryType: GeometryType): Promise<Sync | undefined> {
    const latestSync = await this.find({ where: { layerId, geometryType }, order: { dumpDate: 'DESC' }, take: 1 });
    if (latestSync.length !== 1) {
      return undefined;
    }
    return latestSync[0].getGenericSync();
  }

  public async createSync(sync: Sync): Promise<void> {
    await this.insert(sync);
  }

  public async updateSync(syncId: string, sync: SyncUpdate): Promise<void> {
    await this.update(syncId, sync);
  }

  public async findOneSync(syncId: string): Promise<Sync | undefined> {
    const syncEntity = await this.findOne(syncId);
    if (!syncEntity) {
      return undefined;
    }
    return syncEntity;
  }

  public async findSyncs(filter: Partial<Sync>): Promise<Sync[]> {
    return this.find({ where: filter });
  }
}
