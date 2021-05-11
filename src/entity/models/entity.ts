import { Column, Entity as EntityDecorator, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Changeset } from '../../changeset/models/changeset';
import { ActionType, EntityStatus, Status } from '../../common/enums';
import { File } from '../../file/models/file';

@EntityDecorator()
export class Entity {
  @PrimaryColumn({ name: 'entity_id' })
  public entityId!: string;

  @ManyToOne(() => File, (file) => file.entities)
  @JoinColumn({ name: 'file_id' })
  public file!: File;

  @ManyToOne(() => Changeset, (changeset) => changeset, { nullable: true })
  @JoinColumn({ name: 'changeset_id' })
  public changeset!: Changeset | null;

  @Column({ type: 'enum', enum: EntityStatus, default: Status.IN_PROGRESS })
  public status!: Status;

  @Column({ type: 'enum', enum: ActionType, nullable: true })
  public action!: ActionType | null;

  @Column({ name: 'fail_reason', type: 'text', nullable: true })
  public failReason!: string | null;
}
