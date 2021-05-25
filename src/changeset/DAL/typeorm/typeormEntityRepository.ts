import { EntityRepository, Repository, SelectQueryBuilder } from 'typeorm';
import { EntityStatus, Status } from '../../../common/enums';
import { Entity } from '../../../entity/DAL/typeorm/entity';
import { File } from '../../../file/DAL/typeorm/file';
import { Changeset, UpdateChangeset } from '../../models/changeset';
import { ChangesetRepository } from '../changsetRepository';
import { Changeset as ChangesetDb } from './changeset';

@EntityRepository(ChangesetDb)
export class TypeormChangesetRepository extends Repository<ChangesetDb> implements ChangesetRepository {
  public async createChangeset(changeset: Changeset): Promise<void> {
    await this.save(changeset);
  }

  public async updateChangeset(changesetId: string, changeset: UpdateChangeset): Promise<void> {
    await this.update(changesetId, changeset);
  }

  public async closeChangeset(changesetId: string): Promise<void> {
    await this.manager.connection.transaction(async (transactionalEntityManager) => {
      const endDate = new Date().getTime();

      await transactionalEntityManager
        .createQueryBuilder()
        .update(Entity)
        .set({ status: EntityStatus.COMPLETED })
        .where(`changesetId = :changesetId`, { changesetId })
        .execute();

      await transactionalEntityManager.query(
        `with touched_files as (
              select distinct file_id 
              from osm_sync_tracker.entity 
              where changeset_id = $1)
            
          UPDATE osm_sync_tracker.file as FILE set status = 'completed', end_date = current_timestamp
            FROM (select file_id, COUNT(*) as CompletedEntities
              from osm_sync_tracker.entity
              where file_id in (select * from touched_files)
                and status = 'completed'
              group by file_id) as FILES_TO_UPDATE
          WHERE FILE.file_id = FILES_TO_UPDATE.file_id 
          and FILES_TO_UPDATE.CompletedEntities = FILE.total_entities`,
        [changesetId]
      );

      await transactionalEntityManager.query(
        `with touched_files as (
            select distinct file_id 
            from osm_sync_tracker.entity 
            where changeset_id = $1)
            
          UPDATE osm_sync_tracker.sync as sync_to_update set status = 'completed', end_date = current_timestamp
            FROM (select distinct sync_id, COUNT(file_id) as CompletedFiles from osm_sync_tracker.file
                where file_id in (select * from touched_files) and status = 'completed'
              group by sync_id) as sync_from_changeset
          WHERE sync_to_update.id = sync_from_changeset.sync_id 
          and sync_to_update.total_files = sync_from_changeset.CompletedFiles`,
        [changesetId]
      );
    });

    /*const test: (qb: SelectQueryBuilder<any>) => SelectQueryBuilder<any> = (qb) => {
      return qb
        .select('file_id')
        .addSelect('COUNT(*)', 'CompletedEntities')
        .from(Entity, 'entity')
        .where((qb) => {
          const touchedFiles = qb
            .subQuery()
            .select('file_id')
            .distinct(true)
            .from(Entity, 'entity')
            .where(`changeset_id = :changesetId`, { changesetId })
            .getQuery();
          return 'file_id IN ' + touchedFiles;
        })
        .andWhere('status = :status', { status: EntityStatus.COMPLETED })
        .groupBy('file_id');
    }; */
  }
}
