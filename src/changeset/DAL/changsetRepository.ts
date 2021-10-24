import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { Changeset, UpdateChangeset } from '../models/changeset';
import { Changeset as ChangesetDb } from './typeorm/changeset';

export const changesetRepositorySymbol = Symbol('ChangestRepository');

export interface IChangesetRepository {
  createChangeset: (changeset: Changeset) => Promise<void>;

  updateChangeset: (changesetId: string, changeset: UpdateChangeset) => Promise<void>;

  updateEntitiesOfChangesetAsCompleted: (changesetId: string) => Promise<void>;

  tryClosingChangeset: (changesetId: string, schema: string, isolationLevel: IsolationLevel) => Promise<void>;

  tryClosingChangesets: (changesetIds: string[], schema: string, isolationLevel: IsolationLevel) => Promise<void>;

  findOneChangeset: (changesetId: string) => Promise<ChangesetDb | undefined>;
}
