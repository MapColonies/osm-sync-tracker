import { MigrationInterface, QueryRunner } from 'typeorm';

export class addRerunCompatibility1641129093810 implements MigrationInterface {
  name = 'addRerunCompatibility1641129093810';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "osm_sync_tracker"."rerun" ("rerun_id" uuid NOT NULL, "reference_id" uuid NOT NULL, "number" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_171477edc0fbadeefa712bcf308" PRIMARY KEY ("rerun_id"))`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ADD "is_rerun" boolean NOT NULL`);
    await queryRunner.query(`ALTER TYPE "osm_sync_tracker"."file_status_enum" RENAME TO "file_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."file_status_enum" AS ENUM('inprogress', 'completed', 'failed')`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."file" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."file" ALTER COLUMN "status" TYPE "osm_sync_tracker"."file_status_enum" USING "status"::"text"::"osm_sync_tracker"."file_status_enum"`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."file" ALTER COLUMN "status" SET DEFAULT 'inprogress'`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."file_status_enum_old"`);
    await queryRunner.query(`ALTER TYPE "osm_sync_tracker"."sync_status_enum" RENAME TO "sync_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."sync_status_enum" AS ENUM('inprogress', 'completed', 'failed')`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."sync" ALTER COLUMN "status" TYPE "osm_sync_tracker"."sync_status_enum" USING "status"::"text"::"osm_sync_tracker"."sync_status_enum"`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ALTER COLUMN "status" SET DEFAULT 'inprogress'`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."sync_status_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."rerun" ADD CONSTRAINT "FK_73ed5249166ecc27efcb5536cde" FOREIGN KEY ("reference_id") REFERENCES "osm_sync_tracker"."sync"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."rerun" DROP CONSTRAINT "FK_73ed5249166ecc27efcb5536cde"`);
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."sync_status_enum_old" AS ENUM('inprogress', 'completed')`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."sync" ALTER COLUMN "status" TYPE "osm_sync_tracker"."sync_status_enum_old" USING "status"::"text"::"osm_sync_tracker"."sync_status_enum_old"`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ALTER COLUMN "status" SET DEFAULT 'inprogress'`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."sync_status_enum"`);
    await queryRunner.query(`ALTER TYPE "osm_sync_tracker"."sync_status_enum_old" RENAME TO "sync_status_enum"`);
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."file_status_enum_old" AS ENUM('inprogress', 'completed')`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."file" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."file" ALTER COLUMN "status" TYPE "osm_sync_tracker"."file_status_enum_old" USING "status"::"text"::"osm_sync_tracker"."file_status_enum_old"`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."file" ALTER COLUMN "status" SET DEFAULT 'inprogress'`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."file_status_enum"`);
    await queryRunner.query(`ALTER TYPE "osm_sync_tracker"."file_status_enum_old" RENAME TO "file_status_enum"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" DROP COLUMN "is_rerun"`);
    await queryRunner.query(`DROP TABLE "osm_sync_tracker"."rerun"`);
  }
}
