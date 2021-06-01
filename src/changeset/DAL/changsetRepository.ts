import { Changeset, UpdateChangeset } from '../models/changeset';
import { Changeset as ChangesetDb } from './typeorm/changeset';

export const changesetRepositorySymbol = Symbol('ChangestRepository');

export interface ChangesetRepository {
  createChangeset: (changeset: Changeset) => Promise<void>;

  updateChangeset: (changesetId: string, changeset: UpdateChangeset) => Promise<void>;

  closeChangeset: (entityId: string) => Promise<void>;

  findOneChangeset: (changesetId: string) => Promise<ChangesetDb | undefined>;
}
