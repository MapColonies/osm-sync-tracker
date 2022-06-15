import { MigrationInterface, QueryRunner } from 'typeorm';

export class addBaseSyncIdToEntityHistory1655293587845 implements MigrationInterface {
  name = 'addBaseSyncIdToEntityHistory1655293587845';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_history" ADD "base_sync_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity_history" ADD CONSTRAINT "FK_fdea55efea678dfb91caecc1dcb" FOREIGN KEY ("sync_id") REFERENCES "osm_sync_tracker"."sync"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity_history" ADD CONSTRAINT "FK_9be25a56ae82b667f551d117014" FOREIGN KEY ("base_sync_id") REFERENCES "osm_sync_tracker"."sync"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_history" DROP CONSTRAINT "FK_9be25a56ae82b667f551d117014"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_history" DROP CONSTRAINT "FK_fdea55efea678dfb91caecc1dcb"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_history" DROP COLUMN "base_sync_id"`);
  }
}
