import { inject } from 'tsyringe';
import { EntityManager, EntityRepository, Repository } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { SERVICES } from '../../../common/constants';
import { GeometryType } from '../../../common/enums';
import { IApplication } from '../../../common/interfaces';
import { BaseSync, Sync, SyncUpdate, SyncWithReruns } from '../../models/sync';
import { ISyncRepository } from '../syncRepository';
import { isTransactionFailure } from '../../../common/db';
import { TransactionFailureError } from '../../../changeset/models/errors';
import { SyncDb as DbSync } from './sync';

@EntityRepository(DbSync)
export class SyncRepository extends Repository<DbSync> implements ISyncRepository {
  private readonly transationIsolationLevel: IsolationLevel;

  public constructor(@inject(SERVICES.APPLICATION) private readonly appConfig: IApplication) {
    super();
    this.transationIsolationLevel = this.appConfig.isolationLevel;
  }

  public async getLatestSync(layerId: number, geometryType: GeometryType): Promise<BaseSync | undefined> {
    return this.findOne({
      where: { layerId, geometryType, runNumber: 0 },
      order: { dumpDate: 'DESC' },
      select: ['id', 'dumpDate', 'startDate', 'endDate', 'status', 'layerId', 'isFull', 'totalFiles', 'geometryType'],
    });
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

  public async findOneSyncWithLastRerun(syncId: string): Promise<SyncWithReruns | undefined> {
    return this.createQueryBuilder('sync')
      .leftJoinAndSelect('sync.reruns', 'rerun')
      .where('sync.id = :syncId', { syncId })
      .orderBy('rerun.run_number', 'DESC')
      .limit(1)
      .getOne();
  }

  public async createRerun(rerunSync: Sync, schema: string): Promise<void> {
    try {
      return await this.manager.connection.transaction(this.transationIsolationLevel, async (transactionalEntityManager: EntityManager) => {
        await this.createEntityHistory(rerunSync.baseSyncId as string, rerunSync.id, schema, transactionalEntityManager);

        await this.prepareIncompleteFiles(rerunSync.baseSyncId as string, schema, transactionalEntityManager);

        await this.prepareIncompleteEntities(rerunSync.baseSyncId as string, schema, transactionalEntityManager);

        await this.createSync(rerunSync);
      });
    } catch (error) {
      if (isTransactionFailure(error)) {
        throw new TransactionFailureError(`rerun creation has failed due to read/write dependencies among transactions.`);
      }
      throw error;
    }
  }

  private async createEntityHistory(
    baseSyncId: string,
    rerunSyncId: string,
    schema: string,
    transactionalEntityManager: EntityManager
  ): Promise<void> {
    await transactionalEntityManager.query(
      `
    WITH entities_for_history AS (
      SELECT entity_id, e.file_id, changeset_id, e.status, action, fail_reason
        FROM ${schema}.entity AS e
        JOIN ${schema}.file f ON e.file_id = f.file_id
        WHERE f.sync_id = $1
        AND e.status != 'inrerun'
      EXCEPT
      SELECT e.entity_id, e.file_id, e.changeset_id, e.status, e.action, e.fail_reason
        FROM ${schema}.entity AS e
        LEFT JOIN ${schema}.entity_history h ON e.entity_id = h.entity_id
        WHERE
        h.sync_id IN (
          SELECT id
          FROM ${schema}.sync
          WHERE base_sync_id = $1
          UNION
          SELECT $1
        )
        AND h.status = 'completed'
    )

    INSERT INTO ${schema}.entity_history (entity_id, file_id, sync_id, changeset_id, status, action, fail_reason)
    SELECT entity_id, file_id, $2, changeset_id, status, action, fail_reason
    FROM entities_for_history
    `,
      [baseSyncId, rerunSyncId]
    );
  }

  private async prepareIncompleteFiles(baseSyncId: string, schema: string, transactionalEntityManager: EntityManager): Promise<void> {
    await transactionalEntityManager.query(
      `
    UPDATE ${schema}.file AS file_for_inprogress
    SET status = 'inprogress'
    WHERE file_for_inprogress.file_id IN (
    SELECT DISTINCT f.file_id
    	FROM ${schema}.entity AS e
    	JOIN ${schema}.file f ON e.file_id = f.file_id
    	WHERE f.sync_id = $1
    	AND e.status = 'not_synced'
    )
    `,
      [baseSyncId]
    );
  }

  private async prepareIncompleteEntities(baseSyncId: string, schema: string, transactionalEntityManager: EntityManager): Promise<void> {
    await transactionalEntityManager.query(
      `
    UPDATE ${schema}.entity AS entity_for_rerun
    SET status = 'inrerun', changeset_id = NULL, fail_reason = NULL
    FROM ${schema}.entity AS e
      JOIN ${schema}.file f ON e.file_id = f.file_id
      WHERE f.sync_id = $1
      AND e.file_id = entity_for_rerun.file_id
      AND e.entity_id = entity_for_rerun.entity_id
      AND e.status IN ('inprogress', 'not_synced', 'failed')
    `,
      [baseSyncId]
    );
  }
}
