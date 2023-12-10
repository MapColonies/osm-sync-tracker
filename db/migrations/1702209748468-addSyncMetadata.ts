import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSyncMetadata1702209748468 implements MigrationInterface {
  name = 'AddSyncMetadata1702209748468';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ADD "metadata" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" DROP COLUMN "metadata"`);
  }
}
