import { EntityManager, EntityRepository, Repository } from 'typeorm';
import { inject } from 'tsyringe';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { isTransactionFailure, UpdateResult } from '../../../common/db';
import { EntityStatus } from '../../../common/enums';
import { Entity } from '../../../entity/DAL/typeorm/entity';
import { Changeset, UpdateChangeset } from '../../models/changeset';
import { TransactionFailureError } from '../../models/errors';
import { IChangesetRepository } from '../changsetRepository';
import { Services } from '../../../common/constants';
import { IApplication } from '../../../common/interfaces';
import { Changeset as ChangesetDb } from './changeset';

interface UpdatedId {
  id: string;
}

@EntityRepository(ChangesetDb)
export class ChangesetRepository extends Repository<ChangesetDb> implements IChangesetRepository {
  private readonly transationIsolationLevel: IsolationLevel;

  public constructor(@inject(Services.APPLICATION) private readonly appConfig: IApplication) {
    super();
    this.transationIsolationLevel = this.appConfig.isolationLevel;
  }

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

  public async tryClosingChangesets(changesetIds: string[], schema: string): Promise<string[]> {
    try {
      return await this.manager.connection.transaction(this.transationIsolationLevel, async (transactionalEntityManager) => {
        let completedSyncIds: string[] = [];
        const completedFilesResult = await this.updateFileAsCompleted(changesetIds, schema, transactionalEntityManager);
        // check if there are affected rows from the update
        if (completedFilesResult[1] !== 0) {
          const fileIds = completedFilesResult[0].map((file) => file.id);
          const completedSyncsResult = await this.updateSyncAsCompletedByFiles(fileIds, schema, transactionalEntityManager);
          completedSyncIds = completedSyncsResult[0].map((sync) => sync.id);
        }
        return completedSyncIds;
      });
    } catch (error) {
      if (isTransactionFailure(error)) {
        throw new TransactionFailureError(`closing changesets has failed due to read/write dependencies among transactions.`);
      }
      throw error;
    }
  }

  public async tryClosingChangeset(changesetId: string, schema: string): Promise<void> {
    try {
      await this.manager.connection.transaction(this.transationIsolationLevel, async (transactionalEntityManager) => {
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

  private async updateFileAsCompleted(
    changesetIds: string[],
    schema: string,
    transactionalEntityManager: EntityManager
  ): Promise<UpdateResult<UpdatedId>> {
    return (await transactionalEntityManager.query(
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
    WHERE FILE.file_id = FILES_TO_UPDATE.file_id AND FILES_TO_UPDATE.CompletedEntities = FILE.total_entities AND FILE.status != 'completed'
    RETURNING FILE.file_id AS id`,
      [changesetIds]
    )) as UpdateResult<UpdatedId>;
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

  private async updateSyncAsCompletedByFiles(
    fileIds: string[],
    schema: string,
    transactionalEntityManager: EntityManager
  ): Promise<UpdateResult<UpdatedId>> {
    return (await transactionalEntityManager.query(
      `UPDATE ${schema}.sync AS sync_to_update SET status = 'completed', end_date = current_timestamp
    FROM (
      SELECT DISTINCT sync_id
      FROM ${schema}.file
      WHERE file_id = ANY($1)) AS sync_from_files
    WHERE sync_to_update.id = sync_from_files.sync_id AND sync_to_update.total_files = (SELECT COUNT(*) FROM ${schema}.file WHERE sync_id = sync_to_update.id AND status = 'completed')
    RETURNING sync_to_update.id`,
      [fileIds]
    )) as UpdateResult<UpdatedId>;
  }
}
