import { MigrationInterface, QueryRunner } from 'typeorm';

export class addFileIdConstraintToEntity1623568810719 implements MigrationInterface {
  name = 'addFileIdConstraintToEntity1623568810719';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."entity" DROP CONSTRAINT "PK_83c6377c598f5fac5071ef7dacc"`);
    await queryRunner.query(`ALTER TABLE "public"."entity" ADD CONSTRAINT "PK_b0d4cdc02ef316d72ae7ecf036a" PRIMARY KEY ("entity_id", "file_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."entity" DROP CONSTRAINT "PK_b0d4cdc02ef316d72ae7ecf036a"`);
    await queryRunner.query(`ALTER TABLE "public"."entity" ADD CONSTRAINT "PK_83c6377c598f5fac5071ef7dacc" PRIMARY KEY ("entity_id")`);
  }
}
