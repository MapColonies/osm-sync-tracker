import { CreateDateColumn, JoinColumn, ManyToOne, Entity, PrimaryColumn, Column } from 'typeorm';
import { Sync } from '../../models/sync';
import { Rerun as IRerun } from '../../models/rerun';
import { SyncDb } from './sync';

@Entity()
export class Rerun implements IRerun {
  @PrimaryColumn({ name: 'rerun_id', type: 'uuid' })
  public rerunId!: string;

  @Column({ name: 'reference_id', type: 'uuid' })
  public referenceId!: string;

  @ManyToOne(() => SyncDb, (sync) => sync.reruns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reference_id', referencedColumnName: 'id' })
  public referenceSync!: Sync;

  @Column({ type: 'integer' })
  public number!: number;

  @CreateDateColumn({ name: 'created_at' })
  public createdAt!: Date;
}
