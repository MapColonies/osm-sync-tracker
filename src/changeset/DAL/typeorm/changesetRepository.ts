import { EntityManager, EntityRepository, Repository } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { isTransactionFailure } from '../../../common/db';
import { EntityStatus } from '../../../common/enums';
import { Entity } from '../../../entity/DAL/typeorm/entity';
import { Changeset, UpdateChangeset } from '../../models/changeset';
import { TransactionFailureError } from '../../models/errors';
import { IChangesetRepository } from '../changsetRepository';
import { Changeset as ChangesetDb } from './changeset';

@EntityRepository(ChangesetDb)
export class ChangesetRepository extends Repository<ChangesetDb> implements IChangesetRepository {
  public async createChangeset(changeset: Changeset): Promise<void> {
    await this.insert(changeset);
  }

  public async updateChangeset(changesetId: string, changeset: UpdateChangeset): Promise<void> {
    await this.update(changesetId, changeset);
  }

  public async updateEntitiesOfChangesetAsCompleted(changesetId: string): Promise<void> {
    await this.createQueryBuilder()
      .update(Entity)
      .set({ status: EntityStatus.COMPLETED })
      .where(`changesetId = :changesetId`, { changesetId })
      .execute();
  }

  public async tryClosingChangesets(changesetIds: string[], schema: string, isolationLevel: IsolationLevel): Promise<void> {
    try {
      await this.manager.connection.transaction(isolationLevel, async (transactionalEntityManager) => {
        await this.updateFileAsCompleted(changesetIds, schema, transactionalEntityManager);

        await this.updateSyncAsCompleted(changesetIds, schema, transactionalEntityManager);
      });
    } catch (error) {
      if (isTransactionFailure(error)) {
        throw new TransactionFailureError(`closing changesets has failed due to read/write dependencies among transactions.`);
      }
      throw error;
    }
  }

  public async tryClosingChangeset(changesetId: string, schema: string, isolationLevel: IsolationLevel): Promise<void> {
    try {
      await this.manager.connection.transaction(isolationLevel, async (transactionalEntityManager) => {
        await this.updateEntitiesOfChangesetAsCompletedInTransaction(changesetId, transactionalEntityManager);

        await this.updateFileAsCompleted([changesetId], schema, transactionalEntityManager);

        await this.updateSyncAsCompleted([changesetId], schema, transactionalEntityManager);
      });
    } catch (error) {
      if (isTransactionFailure(error)) {
        throw new TransactionFailureError(`closing changeset ${changesetId} has failed due to read/write dependencies among transactions.`);
      }
      throw error;
    }
  }

  public async findOneChangeset(changesetId: string): Promise<ChangesetDb | undefined> {
    const changesetEntity = await this.findOne(changesetId);
    if (changesetEntity === undefined) {
      return undefined;
    }
    return changesetEntity;
  }

  private async updateEntitiesOfChangesetAsCompletedInTransaction(changesetId: string, transactionalEntityManager: EntityManager): Promise<void> {
    await transactionalEntityManager
      .createQueryBuilder()
      .update(Entity)
      .set({ status: EntityStatus.COMPLETED })
      .where(`changesetId = :changesetId`, { changesetId })
      .execute();
  }

  private async updateFileAsCompleted(changesetIds: string[], schema: string, transactionalEntityManager: EntityManager): Promise<void> {
    await transactionalEntityManager.query(
      `WITH touched_files AS (
      SELECT DISTINCT file_id
      FROM ${schema}.entity
      WHERE changeset_id = ANY($1))

    UPDATE ${schema}.file AS FILE SET status = 'completed', end_date = current_timestamp
    FROM (
      SELECT file_id, COUNT(*) AS CompletedEntities
      FROM ${schema}.entity
      WHERE file_id IN (SELECT * FROM touched_files) AND (status = 'completed' or status = 'not_synced')
      GROUP BY file_id) AS FILES_TO_UPDATE
    WHERE FILE.file_id = FILES_TO_UPDATE.file_id AND FILES_TO_UPDATE.CompletedEntities = FILE.total_entities`,
      [changesetIds]
    );
  }

  private async updateSyncAsCompleted(changesetIds: string[], schema: string, transactionalEntityManager: EntityManager): Promise<void> {
    await transactionalEntityManager.query(
      `WITH touched_files AS (
      SELECT DISTINCT file_id
      FROM ${schema}.entity
      WHERE changeset_id = ANY($1))

    UPDATE ${schema}.sync AS sync_to_update SET status = 'completed', end_date = current_timestamp
    FROM (
      SELECT DISTINCT sync_id
      FROM ${schema}.file
      WHERE file_id IN (SELECT * FROM touched_files) AND status = 'completed') AS sync_from_changeset
    WHERE sync_to_update.id = sync_from_changeset.sync_id AND sync_to_update.total_files = (SELECT COUNT(*) FROM ${schema}.file WHERE sync_id = sync_to_update.id AND status = 'completed')`,
      [changesetIds]
    );
  }
}
