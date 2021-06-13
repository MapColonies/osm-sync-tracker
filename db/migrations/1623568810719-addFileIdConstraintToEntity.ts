import { MigrationInterface, QueryRunner } from 'typeorm';

export class addFileIdConstraintToEntity1623568810719 implements MigrationInterface {
  name = 'addFileIdConstraintToEntity1623568810719';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" DROP CONSTRAINT "PK_d3ba6c77bfcc4d2bf9a20d64897"`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ADD CONSTRAINT "PK_b0d4cdc02ef316d72ae7ecf036a" PRIMARY KEY ("entity_id", "file_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" DROP CONSTRAINT "PK_b0d4cdc02ef316d72ae7ecf036a"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" ADD CONSTRAINT "PK_d3ba6c77bfcc4d2bf9a20d64897" PRIMARY KEY ("entity_id")`);
  }
}
