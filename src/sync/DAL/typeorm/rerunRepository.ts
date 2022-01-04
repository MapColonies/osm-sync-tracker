import { EntityManager, EntityRepository, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import lodash from 'lodash';
import { Status, EntityStatus } from '../../../common/enums';
import { Sync } from '../../models/sync';
import { IRerunRepository } from '../rerunRepository';
import { Entity } from '../../../entity/DAL/typeorm/entity';
import { EntityRerun } from '../../../entity/DAL/typeorm/entityRerun';
import { Rerun } from './rerun';
import { SyncDb as SyncEntity } from './sync';

@EntityRepository(Rerun)
export class RerunRepository extends Repository<Rerun> implements IRerunRepository {
  public async createRerun(referenceSync: Sync, rerunNumber: number): Promise<Sync> {
    const rerunSyncId = uuidv4();
    // TODO: overide startDate
    const { id: referenceSyncId } = referenceSync;
    const sync: Sync = { ...referenceSync, id: rerunSyncId, isRerun: true, status: Status.IN_PROGRESS, endDate: null };
    const rerun = { rerunId: rerunSyncId, referenceId: referenceSyncId, number: rerunNumber };
    await this.manager.connection.transaction(async (transactionalEntityManager: EntityManager) => {
      /* migrate the entities by:
          1. get the files of the original sync
          2. get the entities in those file ids
          3. 
      */

      const inRerunStatus = EntityStatus.IN_RERUN;

      const entities = await transactionalEntityManager
        .createQueryBuilder(Entity, 'entity')
        .leftJoin('entity.file', 'file')
        .where('file.sync_id = :referenceSyncId', { referenceSyncId })
        .andWhere('entity.status != :inRerunStatus', { inRerunStatus })
        .getMany();

      const previousRerunsIds = ((await transactionalEntityManager
        .createQueryBuilder(Rerun, 'rerun')
        .select('rerun.rerunId')
        .where('rerun.reference_id = :referenceSyncId', { referenceSyncId })
        .orderBy('rerun.number', 'DESC')
        .getMany()) as unknown) as string[];

      console.log(previousRerunsIds);

      const completedEntitiesIds = entities.filter((entity) => entity.status === EntityStatus.COMPLETED).map((entity) => entity.entityId);

      const previouslyCompletedEntityIds = ((await transactionalEntityManager.find(EntityRerun, {
        where: { syncId: In(previousRerunsIds), entityId: In(completedEntitiesIds), status: EntityStatus.COMPLETED },
        select: ['entityId'],
      })) as unknown) as string[];

      const currentRerunCompletedEntityIds = lodash.difference(completedEntitiesIds, previouslyCompletedEntityIds);

      console.log(previouslyCompletedEntityIds);

      const entitiesAsEntitiesReruns: EntityRerun[] = entities.map((entity) => ({
        ...entity,
        syncId: previousRerunsIds.length > 0 ? previousRerunsIds[0] : referenceSyncId,
      }));

      console.log(entitiesAsEntitiesReruns);

      // migrate the relevant entities into the entityRerun table
      await transactionalEntityManager.insert(EntityRerun, entitiesAsEntitiesReruns);

      // reset the entities which are not completed
      const entitiesForRerun = entities
        .filter((entity) => entity.status != EntityStatus.COMPLETED)
        .map((entity) => ({
          ...entity,
          status: EntityStatus.IN_RERUN,
          changesetId: null,
          failReason: null,
        }));
      await transactionalEntityManager.save(Entity, entitiesForRerun);

      // create a rerun-entity
      await transactionalEntityManager.insert(Rerun, rerun);

      // create the rerun sync-entity
      await transactionalEntityManager.insert(SyncEntity, sync);
    });

    // TODO: retrieve the inserted sync record
    return sync;
  }
}
