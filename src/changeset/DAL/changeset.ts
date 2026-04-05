import { Column, Entity as EntityDecorator, OneToMany, PrimaryColumn, Relation } from 'typeorm';
import { Entity } from '../../entity/DAL/entity';
import { Changeset as IChangeset } from '../models/changeset';

@EntityDecorator()
export class Changeset implements IChangeset {
  @PrimaryColumn({ name: 'changeset_id', type: 'uuid' })
  public changesetId!: string;

  @Column({ name: 'osm_id', type: 'integer', nullable: true })
  public osmId!: number | null;

  @OneToMany(() => Entity, (entity) => entity.changeset)
  public entities!: Relation<Entity[]>;
}
