import { Column, Entity as EntityDecorator, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Changeset } from '../../changeset/DAL/changeset';
import { ActionType, EntityStatus } from '../../common/enums';
import { File } from '../../file/DAL/file';
import { SyncDb } from '../../sync/DAL/sync';
import { EntityHistory as IEntityHistory } from '../models/entityHistory';

@EntityDecorator()
export class EntityHistory implements IEntityHistory {
  @PrimaryColumn({ name: 'sync_id', type: 'uuid' })
  public syncId!: string;

  @ManyToOne(() => SyncDb, (sync) => sync.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sync_id' })
  public sync?: SyncDb;

  @Column({ name: 'base_sync_id', type: 'uuid', nullable: true })
  public baseSyncId!: string | null;

  @ManyToOne(() => SyncDb, (sync) => sync.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'base_sync_id' })
  public baseSync?: SyncDb;

  @PrimaryColumn({ name: 'entity_id' })
  public entityId!: string;

  @PrimaryColumn({ name: 'file_id', type: 'uuid' })
  public fileId!: string;

  @ManyToOne(() => File, (file) => file.entities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  public file!: File;

  @Column({ name: 'changeset_id', type: 'uuid', nullable: true })
  public changesetId!: string | null;

  @ManyToOne(() => Changeset, (changeset) => changeset.entities, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'changeset_id' })
  public changeset!: Changeset | null;

  @Column({ type: 'enum', enum: EntityStatus })
  public status!: EntityStatus;

  @Column({ type: 'enum', enum: ActionType, nullable: true })
  public action!: ActionType | null;

  @Column({ name: 'fail_reason', type: 'text', nullable: true })
  public failReason!: string | null;
}
