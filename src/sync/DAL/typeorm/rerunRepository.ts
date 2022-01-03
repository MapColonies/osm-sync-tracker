import { EntityRepository, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Status } from '../../../common/enums';
import { Sync } from '../../models/sync';
import { IRerunRepository } from '../rerunRepository';
import { Rerun as RerunEntity } from './rerun';
import { SyncDb as SyncEntity } from './sync';

@EntityRepository(RerunEntity)
export class RerunRepository extends Repository<RerunEntity> implements IRerunRepository {
  public async createRerun(referenceSync: Sync, rerunNumber: number): Promise<Sync> {
    const rerunSyncId = uuidv4();
    // TODO: overide startDate
    const sync: Sync = { ...referenceSync, id: rerunSyncId, isRerun: true, status: Status.IN_PROGRESS, endDate: null };
    const rerun = { rerunId: rerunSyncId, referenceId: referenceSync.id, number: rerunNumber };
    await this.manager.connection.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.insert(SyncEntity, sync);
      await transactionalEntityManager.insert(RerunEntity, rerun);
    });

    // TODO: retrieve the inserted sync record
    return sync;
  }
}
