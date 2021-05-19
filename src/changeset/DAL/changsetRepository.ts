import { Changeset, UpdateChangeset } from '../models/changeset';

export const changesetRepositorySymbol = Symbol('ChangestRepository');

export interface ChangesetRepository {
  createChangeset: (changeset: Changeset) => Promise<void>;
  updateChangeset: (changesetId: string, changeset: UpdateChangeset) => Promise<void>;
  //closeChangeset: (entityId: string) => Promise<void>;
}
