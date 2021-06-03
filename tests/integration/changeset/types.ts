import { Changeset } from '../../../src/changeset/models/changeset';

export type StringifiedSync = Partial<Omit<Changeset, 'osmId'>> & { changesetId?: string; osmId?: string | number };
