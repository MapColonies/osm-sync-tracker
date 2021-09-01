import { EntityRepository, Repository } from 'typeorm';
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

  public async tryClosingChangeset(changesetId: string, schema: string): Promise<void> {
    try {
      await this.manager.connection.transaction('SERIALIZABLE', async (transactionalEntityManager) => {
        await transactionalEntityManager
          .createQueryBuilder()
          .update(Entity)
          .set({ status: EntityStatus.COMPLETED })
          .where(`changesetId = :changesetId`, { changesetId })
          .execute();

        await transactionalEntityManager.query(
          `with touched_files as (
          SELECT distinct file_id
          FROM ${schema}.entity
          WHERE changeset_id = $1)

        UPDATE ${schema}.file as FILE set status = 'completed', end_date = current_timestamp
        FROM (
          SELECT file_id, COUNT(*) as CompletedEntities
          FROM ${schema}.entity
          WHERE file_id in (SELECT * FROM touched_files) and (status = 'completed' or status = 'not_synced')
          group by file_id) as FILES_TO_UPDATE
        WHERE FILE.file_id = FILES_TO_UPDATE.file_id and FILES_TO_UPDATE.CompletedEntities = FILE.total_entities`,
          [changesetId]
        );

        await transactionalEntityManager.query(
          `with touched_files as (
          SELECT distinct file_id
          FROM ${schema}.entity
          WHERE changeset_id = $1)

        UPDATE ${schema}.sync as sync_to_update set status = 'completed', end_date = current_timestamp
        FROM (
          SELECT distinct sync_id
          FROM ${schema}.file
          WHERE file_id in (SELECT * FROM touched_files) and status = 'completed') as sync_from_changeset
        WHERE sync_to_update.id = sync_from_changeset.sync_id and sync_to_update.total_files = (SELECT count (*) from ${schema}.file where sync_id = sync_to_update.id and status = 'completed')`,
          [changesetId]
        );
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
}
