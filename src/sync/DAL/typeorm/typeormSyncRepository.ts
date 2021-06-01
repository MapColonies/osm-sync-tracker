import { EntityRepository, Repository } from 'typeorm';
import { Sync } from '../../models/sync';
import { SyncRepository } from '../syncRepository';
import { SyncDb as DbSync } from './sync';

@EntityRepository(DbSync)
export class TypeormSyncRepository extends Repository<DbSync> implements SyncRepository {
  public async getLatestSync(layerId: number): Promise<Sync | undefined> {
    const latestSync = await this.find({ where: { layerId }, order: { dumpDate: 'DESC' }, take: 1 });
    if (latestSync.length !== 1) {
      return undefined;
    }
    return latestSync[0].getGenericSync();
  }

  public async createSync(sync: Sync): Promise<void> {
    await this.insert(sync);
  }

  public async updateSync(sync: Sync): Promise<void> {
    await this.update(sync.id, sync);
  }

  public async findOneSync(syncId: string): Promise<Sync | undefined> {
    const syncEntity = await this.findOne(syncId);
    if (!syncEntity) {
      return undefined;
    }
    return syncEntity;
  }
}
