import { MigrationInterface, QueryRunner } from 'typeorm';

export class initialMigration1620797256003 implements MigrationInterface {
  name = 'initialMigration1620797256003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."sync_status_enum" AS ENUM('inprogress', 'completed')`);
    await queryRunner.query(
      `CREATE TABLE "osm_sync_tracker"."sync" ("id" uuid NOT NULL, "dump_date" TIMESTAMP NOT NULL, "start_date" TIMESTAMP NOT NULL, "end_date" TIMESTAMP, "status" "osm_sync_tracker"."sync_status_enum" NOT NULL DEFAULT 'inprogress', "layer_id" integer NOT NULL, "is_full" boolean NOT NULL, "total_files" integer, CONSTRAINT "PK_a8e1dd683ac7b9fd6c42fb0ab3d" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."file_status_enum" AS ENUM('inprogress', 'completed')`);
    await queryRunner.query(
      `CREATE TABLE "osm_sync_tracker"."file" ("file_id" uuid NOT NULL, "sync_id" uuid NOT NULL, "start_date" TIMESTAMP NOT NULL, "end_date" TIMESTAMP, "status" "osm_sync_tracker"."file_status_enum" NOT NULL DEFAULT 'inprogress', "total_files" integer, CONSTRAINT "PK_17d33ab8699706c2b9edcd29340" PRIMARY KEY ("file_id"))`
    );
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."entity_status_enum" AS ENUM('inprogress', 'completed', 'not_synced', 'failed')`);
    await queryRunner.query(`CREATE TYPE "osm_sync_tracker"."entity_action_enum" AS ENUM('create', 'modify', 'delete')`);
    await queryRunner.query(
      `CREATE TABLE "osm_sync_tracker"."entity" ("entity_id" character varying NOT NULL, "file_id" uuid NOT NULL, "changeset_id" uuid, "status" "osm_sync_tracker"."entity_status_enum" NOT NULL DEFAULT 'inprogress', "action" "osm_sync_tracker"."entity_action_enum", "fail_reason" text, CONSTRAINT "PK_d3ba6c77bfcc4d2bf9a20d64897" PRIMARY KEY ("entity_id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "osm_sync_tracker"."changeset" ("id" uuid NOT NULL, "osm_id" integer, CONSTRAINT "PK_05c7784f41a3799bc5c106705c5" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."file" ADD CONSTRAINT "FK_1c39660cbdc3080f4aa879b4cf3" FOREIGN KEY ("sync_id") REFERENCES "osm_sync_tracker"."sync"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ADD CONSTRAINT "FK_a4165c9d0cac4bdf8acd5282661" FOREIGN KEY ("file_id") REFERENCES "osm_sync_tracker"."file"("file_id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ADD CONSTRAINT "FK_12f1d58bf4136f5c79f54272b66" FOREIGN KEY ("changeset_id") REFERENCES "osm_sync_tracker"."changeset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" DROP CONSTRAINT "FK_12f1d58bf4136f5c79f54272b66"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" DROP CONSTRAINT "FK_a4165c9d0cac4bdf8acd5282661"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."file" DROP CONSTRAINT "FK_1c39660cbdc3080f4aa879b4cf3"`);
    await queryRunner.query(`DROP TABLE "osm_sync_tracker"."changeset"`);
    await queryRunner.query(`DROP TABLE "osm_sync_tracker"."entity"`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."entity_action_enum"`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."entity_status_enum"`);
    await queryRunner.query(`DROP TABLE "osm_sync_tracker"."file"`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."file_status_enum"`);
    await queryRunner.query(`DROP TABLE "osm_sync_tracker"."sync"`);
    await queryRunner.query(`DROP TYPE "osm_sync_tracker"."sync_status_enum"`);
  }
}
