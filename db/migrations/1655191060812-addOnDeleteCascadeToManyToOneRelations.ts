import { MigrationInterface, QueryRunner } from 'typeorm';

export class addOnDeleteCascadeToManyToOneRelations1655191060812 implements MigrationInterface {
  name = 'addOnDeleteCascadeToManyToOneRelations1655191060812';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" DROP CONSTRAINT "FK_a4165c9d0cac4bdf8acd5282661"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" DROP CONSTRAINT "FK_12f1d58bf4136f5c79f54272b66"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."file" DROP CONSTRAINT "FK_1c39660cbdc3080f4aa879b4cf3"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" DROP CONSTRAINT "FK_292a83d0034acd2443b6621105e"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_history" DROP CONSTRAINT "FK_7007cc0fa39162086ab809dc7d2"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_history" DROP CONSTRAINT "FK_903243c8e78626eff434dd1c0dd"`);
    await queryRunner.query(`DROP INDEX "osm_sync_tracker"."entity_file_id_entity_id_idx"`);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ADD CONSTRAINT "FK_2d7ba486d8557ffd4255a2d6079" FOREIGN KEY ("file_id") REFERENCES "osm_sync_tracker"."file"("file_id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ADD CONSTRAINT "FK_70a6f46890b72752922665b70a6" FOREIGN KEY ("changeset_id") REFERENCES "osm_sync_tracker"."changeset"("changeset_id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."file" ADD CONSTRAINT "FK_dd9a1a2f4793462dec25c0bfd1e" FOREIGN KEY ("sync_id") REFERENCES "osm_sync_tracker"."sync"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."sync" ADD CONSTRAINT "FK_9bba1992a2c7993b5d2a13e2c81" FOREIGN KEY ("base_sync_id") REFERENCES "osm_sync_tracker"."sync"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity_history" ADD CONSTRAINT "FK_9e2bef2400a2f604c496dfdb924" FOREIGN KEY ("file_id") REFERENCES "osm_sync_tracker"."file"("file_id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity_history" ADD CONSTRAINT "FK_790b0f11fdd7d1ee0fe13a017e7" FOREIGN KEY ("changeset_id") REFERENCES "osm_sync_tracker"."changeset"("changeset_id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_history" DROP CONSTRAINT "FK_790b0f11fdd7d1ee0fe13a017e7"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity_history" DROP CONSTRAINT "FK_9e2bef2400a2f604c496dfdb924"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."sync" DROP CONSTRAINT "FK_9bba1992a2c7993b5d2a13e2c81"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."file" DROP CONSTRAINT "FK_dd9a1a2f4793462dec25c0bfd1e"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" DROP CONSTRAINT "FK_70a6f46890b72752922665b70a6"`);
    await queryRunner.query(`ALTER TABLE "osm_sync_tracker"."entity" DROP CONSTRAINT "FK_2d7ba486d8557ffd4255a2d6079"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "entity_file_id_entity_id_idx" ON "osm_sync_tracker"."entity" ("entity_id", "file_id", "status") `);
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity_history" ADD CONSTRAINT "FK_903243c8e78626eff434dd1c0dd" FOREIGN KEY ("changeset_id") REFERENCES "osm_sync_tracker"."changeset"("changeset_id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity_history" ADD CONSTRAINT "FK_7007cc0fa39162086ab809dc7d2" FOREIGN KEY ("file_id") REFERENCES "osm_sync_tracker"."file"("file_id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."sync" ADD CONSTRAINT "FK_292a83d0034acd2443b6621105e" FOREIGN KEY ("base_sync_id") REFERENCES "osm_sync_tracker"."sync"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."file" ADD CONSTRAINT "FK_1c39660cbdc3080f4aa879b4cf3" FOREIGN KEY ("sync_id") REFERENCES "osm_sync_tracker"."sync"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ADD CONSTRAINT "FK_12f1d58bf4136f5c79f54272b66" FOREIGN KEY ("changeset_id") REFERENCES "osm_sync_tracker"."changeset"("changeset_id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "osm_sync_tracker"."entity" ADD CONSTRAINT "FK_a4165c9d0cac4bdf8acd5282661" FOREIGN KEY ("file_id") REFERENCES "osm_sync_tracker"."file"("file_id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }
}
