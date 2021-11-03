import { MigrationInterface, QueryRunner } from 'typeorm';

export class addEntityIndex1635784228947 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE UNIQUE INDEX "entity_file_id_entity_id_idx" ON "osm_sync_tracker"."entity" ("file_id", "entity_id") INCLUDE ("status")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "osm_sync_tracker"."entity_file_id_entity_id_idx"
        `);
  }
}
