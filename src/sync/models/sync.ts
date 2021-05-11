import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { Status } from '../../common/enums';
import { File } from '../../file/models/file';

@Entity()
export class Sync {
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
}
