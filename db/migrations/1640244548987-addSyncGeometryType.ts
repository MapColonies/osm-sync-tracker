import { MigrationInterface, QueryRunner } from 'typeorm';

export class addSyncGeometryType1640244548987 implements MigrationInterface {
  name = 'addSyncGeometryType1640244548987';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."sync_geometry_type_enum" AS ENUM('point', 'linestring', 'polygon')`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ADD "geometry_type" "osm_sync_tracker"."sync_geometry_type_enum" NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" DROP COLUMN "geometry_type"`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."sync_geometry_type_enum"`);
  }
}
