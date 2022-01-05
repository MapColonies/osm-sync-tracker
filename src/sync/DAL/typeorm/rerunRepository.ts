import { EntityManager, EntityRepository, Repository, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import lodash from 'lodash';
import { Status, EntityStatus } from '../../../common/enums';
import { Sync } from '../../models/sync';
import { IRerunRepository } from '../rerunRepository';
import { Entity } from '../../../entity/DAL/typeorm/entity';
import { EntityRerun } from '../../../entity/DAL/typeorm/entityRerun';
import { Rerun } from './rerun';
import { SyncDb } from './sync';

@EntityRepository(Rerun)
export class RerunRepository extends Repository<Rerun> implements IRerunRepository {
  public async findOneRerun(rerunSyncId: string): Promise<Rerun | undefined> {
    return this.findOne(rerunSyncId);
  }

  public async findReruns(filter: Partial<Rerun>): Promise<Rerun[]> {
    return this.find({ where: filter });
  }

  public async createRerun(referenceSync: Sync, rerunNumber: number): Promise<SyncDb> {
    const rerunSyncId = uuidv4();
    // TODO: overide startDate
    const { id: referenceSyncId } = referenceSync;
    const sync: Sync = { ...referenceSync, id: rerunSyncId, isRerun: true, status: Status.IN_PROGRESS, endDate: null };
    const rerun = { rerunId: rerunSyncId, referenceId: referenceSyncId, number: rerunNumber };
    return this.manager.connection.transaction(async (transactionalEntityManager: EntityManager) => {
      const entities = await transactionalEntityManager
        .createQueryBuilder(Entity, 'entity')
        .leftJoin('entity.file', 'file')
        .where('file.sync_id = :referenceSyncId', { referenceSyncId })
        .andWhere('entity.status != :inRerunStatus', { inRerunStatus: EntityStatus.IN_RERUN })
        .getMany();

      const previousRerunIds = (await transactionalEntityManager.find(Rerun, {
        where: { referenceId: referenceSyncId },
        order: { number: 'DESC' },
        select: ['rerunId'],
      })) as { rerunId: string }[];

      const completedEntityIds = entities.filter((entity) => entity.status === EntityStatus.COMPLETED).map((entity) => entity.entityId);
      const previouslyCompletedIds = (await transactionalEntityManager.find(EntityRerun, {
        where: {
          syncId: In([referenceSyncId, ...previousRerunIds.map((rerun) => rerun.rerunId)]),
          entityId: In(completedEntityIds),
          status: EntityStatus.COMPLETED,
        },
        select: ['entityId'],
      })) as { entityId: string }[];

      // filter only the entity ids which were not already completed previously, those entities should be migrated to entity_rerun table
      const notPreviouslyCompletedIds = lodash.difference(
        entities.map((entity) => entity.entityId),
        previouslyCompletedIds.map((entity) => entity.entityId)
      );

      // add sync id for the entities which were not already completed
      const syncId = previousRerunIds.length > 0 ? previousRerunIds[0].rerunId : referenceSyncId;
      const entitiesAsEntitiesReruns = entities
        .filter((entity) => notPreviouslyCompletedIds.includes(entity.entityId))
        .map((entity) => ({
          ...entity,
          syncId,
        }));

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

      // create the rerun sync-entity and return it
      const insertResult = await transactionalEntityManager.insert(SyncDb, sync);
      return (transactionalEntityManager.findOne(SyncDb, insertResult.identifiers[0]) as unknown) as SyncDb;
    });
  }
}
