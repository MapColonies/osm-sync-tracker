import { Column, Entity as EntityDecorator, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { Status } from '../../common/enums';
import { Entity } from '../../entity/models/entity';
import { Sync } from '../../sync/models/sync';

@EntityDecorator()
export class File {
  @PrimaryColumn({ name: 'file_id', type: 'uuid' })
  public fileId!: string;

  @ManyToOne(() => Sync, (sync) => sync.files)
  @JoinColumn({ name: 'sync_id' })
  public sync!: Sync;

  @OneToMany(() => Entity, (entity) => entity.file)
  public entities!: Entity[];

  @Column({ name: 'start_date' })
  public startDate!: Date;

  @Column({ name: 'end_date', nullable: true, type: 'timestamp' })
  public endDate!: Date | null;

  @Column({ type: 'enum', enum: Status, default: Status.IN_PROGRESS })
  public status!: Status;

  @Column({ name: 'total_files', nullable: true, type: 'integer' })
  public totalEntities!: number | null;

  // @Column({type: 'uuid', name: 'sync_id'})
  // public syncId!: string
}
