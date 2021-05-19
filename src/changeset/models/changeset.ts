export type UpdateChangeset = Omit<Changeset, 'changesetId' | 'entities'>;

export interface Changeset {
  changesetId: string;

  osmId?: number;
}
