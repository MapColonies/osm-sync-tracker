import { EntityRepository, Repository } from 'typeorm';
import { GeometryType } from '../../../common/enums';
import { Sync, SyncUpdate, SyncWithReruns } from '../../models/sync';
import { ISyncRepository } from '../syncRepository';
import { SyncDb as DbSync } from './sync';

@EntityRepository(DbSync)
export class SyncRepository extends Repository<DbSync> implements ISyncRepository {
  public async getLatestSync(layerId: number, geometryType: GeometryType): Promise<Sync | undefined> {
    const latestSync = await this.find({ where: { layerId, geometryType, isRerun: false }, order: { dumpDate: 'DESC' }, take: 1 });
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
    return this.findOne(syncId);
  }

  public async findSyncs(filter: Partial<Sync>): Promise<Sync[]> {
    return this.find({ where: filter });
  }

  public async findOneSyncWithReruns(syncId: string): Promise<SyncWithReruns | undefined> {
    return this.findOne({
      relations: ['reruns'],
      where: { id: syncId },
    });
  }
}
