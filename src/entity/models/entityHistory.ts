import { Entity } from './entity';

export interface EntityHistory extends Entity {
  syncId: string;
}
