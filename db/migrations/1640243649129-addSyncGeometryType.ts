import { MigrationInterface, QueryRunner } from 'typeorm';

export class addSyncGeometryType1640243649129 implements MigrationInterface {
  name = 'addSyncGeometryType1640243649129';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."sync_geometry_type_enum" AS ENUM('point', 'line', 'polygon')`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ADD "geometry_type" "osm_sync_tracker"."sync_geometry_type_enum" NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" DROP COLUMN "geometry_type"`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."sync_geometry_type_enum"`);
  }
}
