import { EntityRepository, Repository } from 'typeorm';
import { GeometryType } from '../../../common/enums';
import { Sync } from '../../models/sync';
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

  public async findFullSyncByLayerAndGeometry(layerId: number, geometryType: GeometryType): Promise<Sync | undefined> {
    const fullSyncEntity = await this.findOne({ where: { layerId, geometryType, isFull: true } });
    if (!fullSyncEntity) {
      return undefined;
    }
    return fullSyncEntity;
  }
}
