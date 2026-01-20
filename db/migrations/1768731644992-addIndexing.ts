import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexing1768731644992 implements MigrationInterface {
  name = 'AddIndexing1768731644992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_entity_file_closed" ON "osm_sync_tracker"."entity" ("file_id") WHERE status IN ('completed', 'not_synced')`
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entity_file_status" ON "osm_sync_tracker"."entity" ("file_id", "status") `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entity_changeset_file" ON "osm_sync_tracker"."entity" ("changeset_id", "file_id") `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_file_sync_completed" ON "osm_sync_tracker"."file" ("sync_id") WHERE status = 'completed'`
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_file_sync_status" ON "osm_sync_tracker"."file" ("sync_id", "status") `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_file_status" ON "osm_sync_tracker"."file" ("status") `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_sync_base_status" ON "osm_sync_tracker"."sync" ("base_sync_id", "status") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "osm_sync_tracker"."idx_sync_base_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "osm_sync_tracker"."idx_file_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "osm_sync_tracker"."idx_file_sync_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "osm_sync_tracker"."idx_file_sync_completed"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "osm_sync_tracker"."idx_entity_changeset_file"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "osm_sync_tracker"."idx_entity_file_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "osm_sync_tracker"."idx_entity_file_closed"`);
  }
}
