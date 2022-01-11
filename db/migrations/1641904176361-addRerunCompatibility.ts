import { MigrationInterface, QueryRunner } from 'typeorm';

export class addRerunCompatibility1641904176361 implements MigrationInterface {
  name = 'addRerunCompatibility1641904176361';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "osm_sync_tracker"."rerun" ("rerun_id" uuid NOT NULL, "reference_id" uuid NOT NULL, "number" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_171477edc0fbadeefa712bcf308" PRIMARY KEY ("rerun_id"))`
    );
    await queryRunner.query(
      `CREATE TYPE "osm_sync_tracker"."entity_rerun_status_enum" AS ENUM('inprogress', 'completed', 'not_synced', 'failed', 'inrerun')`
    );
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."entity_rerun_action_enum" AS ENUM('create', 'modify', 'delete')`);
    await queryRunner.query(
      `CREATE TABLE "osm_sync_tracker"."entity_rerun" ("entity_id" character varying NOT NULL, "file_id" uuid NOT NULL, "sync_id" uuid NOT NULL, "changeset_id" uuid, "status" "osm_sync_tracker"."entity_rerun_status_enum" NOT NULL, "action" "osm_sync_tracker"."entity_rerun_action_enum", "fail_reason" text, CONSTRAINT "PK_b6deb3c1e2ca280a4e40c102f77" PRIMARY KEY ("entity_id", "file_id", "sync_id"))`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" ADD "is_rerun" boolean NOT NULL`);
    await queryRunner.query(`ALTER TYPE "osm_sync_tracker"."entity_status_enum" RENAME TO "entity_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "osm_sync_tracker"."entity_status_enum" AS ENUM('inprogress', 'completed', 'not_synced', 'failed', 'inrerun')`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ALTER COLUMN "status" TYPE "osm_sync_tracker"."entity_status_enum" USING "status"::"text"::"osm_sync_tracker"."entity_status_enum"`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" ALTER COLUMN "status" SET DEFAULT 'inprogress'`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."entity_status_enum_old"`);
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
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity_rerun" ADD CONSTRAINT "FK_7007cc0fa39162086ab809dc7d2" FOREIGN KEY ("file_id") REFERENCES "osm_sync_tracker"."file"("file_id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity_rerun" ADD CONSTRAINT "FK_903243c8e78626eff434dd1c0dd" FOREIGN KEY ("changeset_id") REFERENCES "osm_sync_tracker"."changeset"("changeset_id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_rerun" DROP CONSTRAINT "FK_903243c8e78626eff434dd1c0dd"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_rerun" DROP CONSTRAINT "FK_7007cc0fa39162086ab809dc7d2"`);
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
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."entity_status_enum_old" AS ENUM('inprogress', 'completed', 'not_synced', 'failed')`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ALTER COLUMN "status" TYPE "osm_sync_tracker"."entity_status_enum_old" USING "status"::"text"::"osm_sync_tracker"."entity_status_enum_old"`
    );
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" ALTER COLUMN "status" SET DEFAULT 'inprogress'`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."entity_status_enum"`);
    await queryRunner.query(`ALTER TYPE "osm_sync_tracker"."entity_status_enum_old" RENAME TO "entity_status_enum"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" DROP COLUMN "is_rerun"`);
    await queryRunner.query(`DROP TABLE "osm_sync_tracker"."entity_rerun"`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."entity_rerun_action_enum"`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."entity_rerun_status_enum"`);
    await queryRunner.query(`DROP TABLE "osm_sync_tracker"."rerun"`);
  }
}
