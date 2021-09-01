import { Changeset, UpdateChangeset } from '../models/changeset';
import { Changeset as ChangesetDb } from './typeorm/changeset';

export const changesetRepositorySymbol = Symbol('ChangestRepository');

export interface IChangesetRepository {
  createChangeset: (changeset: Changeset) => Promise<void>;

  updateChangeset: (changesetId: string, changeset: UpdateChangeset) => Promise<void>;

  tryClosingChangeset: (changesetId: string, schema: string) => Promise<void>;

  findOneChangeset: (changesetId: string) => Promise<ChangesetDb | undefined>;
}
