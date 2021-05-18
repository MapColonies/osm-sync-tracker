import { Column, Entity as EntityDecorator, OneToMany, PrimaryColumn } from 'typeorm';
import { Entity } from '../../entity/models/DAL/typeorm/entity';

@EntityDecorator()
export class Changeset {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public changesetId!: string;

  @Column({ name: 'osm_id', type: 'integer', nullable: true })
  public osmId!: number | null;

  @OneToMany(() => Entity, (entity) => entity.changeset)
  public entities!: Entity[];
}
