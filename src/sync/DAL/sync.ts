import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, Relation } from 'typeorm';
import { GeometryType, Status } from '../../common/enums';
import { File } from '../../file/DAL/file';
import { Sync as ISync } from '../models/sync';

export const SYNC_IDENTIFIER_COLUMN = 'id';

@Entity({ name: 'sync' })
export class SyncDb implements ISync {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ name: 'dump_date' })
  public dumpDate!: Date;

  @Column({ name: 'start_date' })
  public startDate!: Date;

  @Column({ name: 'end_date', nullable: true, type: 'timestamp' })
  public endDate!: Date | null;

  @Column({ type: 'enum', enum: Status, default: Status.IN_PROGRESS })
  public status!: Status;

  @Column({ name: 'layer_id' })
  public layerId!: number;

  @Column({ name: 'is_full' })
  public isFull!: boolean;

  @Column({ name: 'total_files', nullable: true, type: 'integer' })
  public totalFiles!: number | null;

  @OneToMany(() => File, (file) => file.sync)
  public files!: Relation<File[]>;

  @Column({ name: 'geometry_type', type: 'enum', enum: GeometryType })
  public geometryType!: GeometryType;

  @Column({ name: 'base_sync_id', type: 'uuid', nullable: true })
  public baseSyncId!: string | null;

  @ManyToOne(() => SyncDb, (sync) => sync.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'base_sync_id' })
  public baseSync?: Relation<SyncDb>;

  @OneToMany(() => SyncDb, (sync) => sync.baseSync)
  public reruns!: Relation<SyncDb[]>;

  @Column({ name: 'run_number', type: 'integer', default: 0 })
  public runNumber!: number;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  public metadata!: Record<string, unknown> | null;
}
