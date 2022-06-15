import { Entity } from './entity';

export interface EntityHistory extends Entity {
  syncId: string;
  baseSyncId: string | null;
}
