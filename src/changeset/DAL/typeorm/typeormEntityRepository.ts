import { EntityRepository, Repository } from 'typeorm';
import { EntityStatus } from '../../../common/enums';
import { Entity } from '../../../entity/DAL/typeorm/entity';
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
    await this.createQueryBuilder().update(Entity).set({ status: EntityStatus.COMPLETED }).where(`changesetId = ${changesetId}`).execute();
  }
}
