import { EntityRepository, Repository } from 'typeorm';
import { Sync } from '../../models/sync';
import { SyncRepository } from '../syncRepository';
import { SyncDb as DbSync } from './sync';

@EntityRepository(DbSync)
export class TypeormSyncRepository extends Repository<DbSync> implements SyncRepository {
  public async getLatestSync(layerId: number): Promise<Sync> {
    const latestSync = await this.find({ where: { layerId }, order: { dumpDate: 'DESC' }, take: 1 });
    if (latestSync.length === 1) {
      return latestSync[0].getGenericSync();
    }
    throw new Error('not found');
  }

  public async createSync(sync: Sync): Promise<void> {
    await this.save(sync);
  }

  public async updateSync(sync: Sync): Promise<void> {
    await this.save(sync);
  }
}
