import { Column, Entity as EntityDecorator, JoinColumn, ManyToOne, PrimaryColumn, Relation } from 'typeorm';
import { Changeset } from '../../changeset/DAL/changeset';
import { ActionType, EntityStatus } from '../../common/enums';
import { File } from '../../file/DAL/file';
import { Entity as IEntity } from '../models/entity';

@EntityDecorator()
export class Entity implements IEntity {
  @PrimaryColumn({ name: 'entity_id' })
  public entityId!: string;

  @ManyToOne(() => File, (file) => file.entities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  public file!: Relation<File>;

  @PrimaryColumn({ name: 'file_id', type: 'uuid' })
  public fileId!: string;

  @ManyToOne(() => Changeset, (changeset) => changeset.entities, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'changeset_id' })
  public changeset!: Relation<Changeset | null>;

  @Column({ name: 'changeset_id', type: 'uuid', nullable: true })
  public changesetId!: string | null;

  @Column({ type: 'enum', enum: EntityStatus, default: EntityStatus.IN_PROGRESS })
  public status!: EntityStatus;

  @Column({ type: 'enum', enum: ActionType, nullable: true })
  public action!: ActionType | null;

  @Column({ name: 'fail_reason', type: 'text', nullable: true })
  public failReason!: string | null;
}
