import { Column, Entity as EntityDecorator, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Changeset } from '../../../changeset/DAL/typeorm/changeset';
import { ActionType, EntityStatus } from '../../../common/enums';
import { File } from '../../../file/DAL/typeorm/file';
import { EntityHistory as IEntityHistory } from '../../models/entityHistory';

@EntityDecorator()
export class EntityHistory implements IEntityHistory {
  @PrimaryColumn({ name: 'entity_id' })
  public entityId!: string;

  @ManyToOne(() => File, (file) => file.entities)
  @JoinColumn({ name: 'file_id' })
  public file!: File;

  @PrimaryColumn({ name: 'file_id', type: 'uuid' })
  public fileId!: string;

  @PrimaryColumn({ name: 'sync_id', type: 'uuid' })
  public syncId!: string;

  @ManyToOne(() => Changeset, (changeset) => changeset.entities, { nullable: true })
  @JoinColumn({ name: 'changeset_id' })
  public changeset!: Changeset | null;

  @Column({ name: 'changeset_id', type: 'uuid', nullable: true })
  public changesetId!: string | null;

  @Column({ type: 'enum', enum: EntityStatus })
  public status!: EntityStatus;

  @Column({ type: 'enum', enum: ActionType, nullable: true })
  public action!: ActionType | null;

  @Column({ name: 'fail_reason', type: 'text', nullable: true })
  public failReason!: string | null;
}
