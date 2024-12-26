import { Column, Entity as EntityDecorator, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { Status } from '../../common/enums';
import { Entity } from '../../entity/DAL/entity';
import { SyncDb } from '../../sync/DAL/sync';
import { File as IFile } from '../models/file';

export const FILE_IDENTIFIER_COLUMN = 'fileId';
export const SYNC_OF_FILE_IDENTIFIER_COLUMN = 'syncId';

@EntityDecorator()
export class File implements IFile {
  @PrimaryColumn({ name: 'file_id', type: 'uuid' })
  public fileId!: string;

  @ManyToOne(() => SyncDb, (sync) => sync.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sync_id' })
  public sync!: SyncDb;

  @Column({ name: 'sync_id', type: 'uuid' })
  public syncId!: string;

  @OneToMany(() => Entity, (entity) => entity.file)
  public entities!: Entity[];

  @Column({ name: 'start_date' })
  public startDate!: Date;

  @Column({ name: 'end_date', nullable: true, type: 'timestamp' })
  public endDate!: Date | null;

  @Column({ type: 'enum', enum: Status, default: Status.IN_PROGRESS })
  public status!: Status;

  @Column({ name: 'total_entities', nullable: true, type: 'integer' })
  public totalEntities!: number | null;
}
