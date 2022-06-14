export type UpdateChangeset = Omit<Changeset, 'changesetId'>;

export interface Changeset {
  changesetId: string;

  osmId?: number;
}
