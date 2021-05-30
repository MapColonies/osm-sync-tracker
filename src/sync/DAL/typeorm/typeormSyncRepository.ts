import { EntityRepository, Repository } from 'typeorm';
import { SyncAlreadyExistsError, SyncNotFoundError } from '../../models/errors';
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
    throw new SyncNotFoundError(`sync with layer id = ${layerId} not found`);
  }

  public async createSync(sync: Sync): Promise<void> {
    const syncEntity = await this.findOne(sync.id);
    if (syncEntity) {
      throw new SyncAlreadyExistsError(`sync = ${syncEntity.id} already exists`);
    }
    await this.insert(sync);
  }

  public async updateSync(sync: Sync): Promise<void> {
    const syncEntity = await this.findOne(sync.id);
    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${sync.id} not found`);
    }
    await this.update(sync.id, sync);
  }
}
