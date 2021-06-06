import { EntityRepository, Repository } from 'typeorm';
import { EntityStatus } from '../../../common/enums';
import { Entity } from '../../../entity/DAL/typeorm/entity';
import { Changeset, UpdateChangeset } from '../../models/changeset';
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

  public async closeChangeset(changesetId: string, schema: string): Promise<void> {
    await this.manager.connection.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager
        .createQueryBuilder()
        .update(Entity)
        .set({ status: EntityStatus.COMPLETED })
        .where(`changesetId = :changesetId`, { changesetId })
        .execute();

      await transactionalEntityManager.query(
        `with touched_files as (
          select distinct file_id
          from ${schema}.entity
          where changeset_id = $1)

        UPDATE ${schema}.file as FILE set status = 'completed', end_date = current_timestamp
        FROM (select file_id, COUNT(*) as CompletedEntities
        FROM ${schema}.entity
        WHERE file_id in (select * from touched_files) and status = 'completed'
        group by file_id) as FILES_TO_UPDATE
        WHERE FILE.file_id = FILES_TO_UPDATE.file_id and FILES_TO_UPDATE.CompletedEntities = FILE.total_entities`,
        [changesetId]
      );

      await transactionalEntityManager.query(
        `with touched_files as (
          select distinct file_id
          from ${schema}.entity
          where changeset_id = $1)

        UPDATE ${schema}.sync as sync_to_update set status = 'completed', end_date = current_timestamp
        FROM (select distinct sync_id, COUNT(file_id) as CompletedFiles
        FROM ${schema}.file
        WHERE file_id in (select * from touched_files) and status = 'completed'
        group by sync_id) as sync_from_changeset
        WHERE sync_to_update.id = sync_from_changeset.sync_id and sync_to_update.total_files = sync_from_changeset.CompletedFiles`,
        [changesetId]
      );
    });
  }

  public async findOneChangeset(changesetId: string): Promise<ChangesetDb | undefined> {
    const changesetEntity = await this.findOne(changesetId);
    if (changesetEntity === undefined) {
      return undefined;
    }
    return changesetEntity;
  }
}
