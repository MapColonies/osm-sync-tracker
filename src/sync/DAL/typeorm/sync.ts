import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { GeometryType, Status } from '../../../common/enums';
import { File } from '../../../file/DAL/typeorm/file';
import { Sync as ISync } from '../../models/sync';
import { Rerun } from './rerun';

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
  public files!: File[];

  @Column({ name: 'geometry_type', type: 'enum', enum: GeometryType })
  public geometryType!: GeometryType;

  @Column({ name: 'is_rerun' })
  public isRerun!: boolean;

  @OneToMany(() => Rerun, (rerun) => rerun.referenceSync)
  public reruns!: Rerun[];

  public getGenericSync(): ISync {
    return {
      dumpDate: this.dumpDate,
      endDate: this.endDate,
      id: this.id,
      isFull: this.isFull,
      layerId: this.layerId,
      startDate: this.startDate,
      status: this.status,
      totalFiles: this.totalFiles,
      geometryType: this.geometryType,
      isRerun: this.isRerun,
    };
  }
}
