import { EntityManager, EntityRepository, Repository, In } from 'typeorm';
import lodash from 'lodash';
import { inject } from 'tsyringe';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { Status, EntityStatus } from '../../../common/enums';
import { IRerunRepository } from '../rerunRepository';
import { Entity } from '../../../entity/DAL/typeorm/entity';
import { File } from '../../../file/DAL/typeorm/file';
import { EntityRerun } from '../../../entity/DAL/typeorm/entityRerun';
import { Rerun } from '../../models/rerun';
import { Sync } from '../../models/sync';
import { isTransactionFailure } from '../../../common/db';
import { TransactionFailureError } from '../../../changeset/models/errors';
import { SERVICES } from '../../../common/constants';
import { IApplication } from '../../../common/interfaces';
import { Rerun as RerunDb } from './rerun';
import { SyncDb } from './sync';

@EntityRepository(RerunDb)
export class RerunRepository extends Repository<RerunDb> implements IRerunRepository {
  private readonly transationIsolationLevel: IsolationLevel;

  public constructor(@inject(SERVICES.APPLICATION) private readonly appConfig: IApplication) {
    super();
    this.transationIsolationLevel = this.appConfig.isolationLevel;
  }

  public async findOneRerun(rerunSyncId: string): Promise<RerunDb | undefined> {
    return this.findOne(rerunSyncId);
  }

  public async findReruns(filter: Partial<RerunDb>): Promise<RerunDb[]> {
    return this.find({ where: filter });
  }

  public async createRerun(rerun: Rerun, rerunAsSync: Sync): Promise<void> {
    const { referenceId: referenceSyncId } = rerun;

    try {
      return await this.manager.connection.transaction(this.transationIsolationLevel, async (transactionalEntityManager: EntityManager) => {
        const entities = await this.findEntitiesBySyncId(referenceSyncId, transactionalEntityManager);
        const completedEntityIds = entities.filter((entity) => entity.status === EntityStatus.COMPLETED).map((entity) => entity.entityId);

        const previousRerunIds = await this.findRerunIdsOfSync(referenceSyncId, transactionalEntityManager);
        const syncAndPreviousRerunIds = [referenceSyncId, ...previousRerunIds.map((rerun) => rerun.rerunId)];

        const previouslyCompletedIds = await this.findPreviouslyCompletedEntityIdsBySyncIds(
          syncAndPreviousRerunIds,
          completedEntityIds,
          transactionalEntityManager
        );

        const lastRerunId = previousRerunIds.length > 0 ? previousRerunIds[0].rerunId : referenceSyncId;

        await this.createRerunEntities(
          entities,
          previouslyCompletedIds.map((entity) => entity.entityId),
          lastRerunId,
          transactionalEntityManager
        );

        // update the entities which are not completed to be in rerun
        await this.updateIncompleteEntities(entities, transactionalEntityManager);

        // update the files which might be completed due to having completed and not-synced mixed entities as in progress
        await this.updateIncompleteFiles(entities, transactionalEntityManager);

        // create the rerun-entity
        await transactionalEntityManager.insert(RerunDb, rerun);

        // create the sync-entity
        await transactionalEntityManager.insert(SyncDb, rerunAsSync);
      });
    } catch (error) {
      if (isTransactionFailure(error)) {
        throw new TransactionFailureError(`create rerun has failed due to read/write dependencies among transactions.`);
      }
      throw error;
    }
  }

  private async findEntitiesBySyncId(syncId: string, transactionalEntityManager: EntityManager): Promise<Entity[]> {
    // no need to fetch the already marked with in-rerun status
    return transactionalEntityManager
      .createQueryBuilder(Entity, 'entity')
      .leftJoin('entity.file', 'file')
      .where('file.sync_id = :syncId', { syncId })
      .andWhere('entity.status != :inRerunStatus', { inRerunStatus: EntityStatus.IN_RERUN })
      .getMany();
  }

  private async findRerunIdsOfSync(syncId: string, transactionalEntityManager: EntityManager): Promise<{ rerunId: string }[]> {
    return transactionalEntityManager.find(RerunDb, {
      where: { referenceId: syncId },
      order: { number: 'DESC' },
      select: ['rerunId'],
    });
  }

  private async findPreviouslyCompletedEntityIdsBySyncIds(
    syncIds: string[],
    entityIds: string[],
    transactionalEntityManager: EntityManager
  ): Promise<{ entityId: string }[]> {
    return transactionalEntityManager.find(EntityRerun, {
      where: {
        syncId: In(syncIds),
        entityId: In(entityIds),
        status: EntityStatus.COMPLETED,
      },
      select: ['entityId'],
    });
  }

  private async updateIncompleteEntities(entities: Entity[], transactionalEntityManager: EntityManager): Promise<void> {
    // update the entities which are not completed to be in rerun
    const entitiesForRerun = entities
      .filter((entity) => entity.status != EntityStatus.COMPLETED)
      .map((entity) => ({
        ...entity,
        status: EntityStatus.IN_RERUN,
        changesetId: null,
        failReason: null,
      }));

    await transactionalEntityManager.save(Entity, entitiesForRerun);
  }

  private async updateIncompleteFiles(entities: Entity[], transactionalEntityManager: EntityManager): Promise<void> {
    const incompleteFileIds = entities.filter((entity) => entity.status == EntityStatus.NOT_SYNCED).map((entity) => entity.fileId);
    if (incompleteFileIds.length > 0) {
      const uniqueFileIds = lodash.uniq(incompleteFileIds);
      await transactionalEntityManager.update(File, uniqueFileIds, { status: Status.IN_PROGRESS, endDate: null });
    }
  }

  private async createRerunEntities(
    entities: Entity[],
    previouslyCompletedIds: string[],
    syncId: string,
    transactionalEntityManager: EntityManager
  ): Promise<void> {
    // filter only the entity ids which were not already completed previously, those entities should be migrated to entity_rerun table
    const notPreviouslyCompletedIds = lodash.difference(
      entities.map((entity) => entity.entityId),
      previouslyCompletedIds
    );

    // add sync id to the entities which were not already completed
    const entitiesAsEntitiesReruns = entities
      .filter((entity) => notPreviouslyCompletedIds.includes(entity.entityId))
      .map((entity) => ({
        ...entity,
        syncId,
      }));

    // migrate the relevant entities into the entityRerun table
    await transactionalEntityManager.insert(EntityRerun, entitiesAsEntitiesReruns);
  }
}
