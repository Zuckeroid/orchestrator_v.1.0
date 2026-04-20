import { MigrationInterface, QueryRunner } from 'typeorm';

export class NodeHealthTracking1776600000000 implements MigrationInterface {
  name = 'NodeHealthTracking1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      ADD COLUMN IF NOT EXISTS "health_status" text NOT NULL DEFAULT 'unknown'
    `);

    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      ADD COLUMN IF NOT EXISTS "last_health_check_at" timestamp
    `);

    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      ADD COLUMN IF NOT EXISTS "last_successful_health_check_at" timestamp
    `);

    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      ADD COLUMN IF NOT EXISTS "failure_count" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vpn_nodes_health_status"
      ON "vpn_nodes" ("health_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_vpn_nodes_health_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      DROP COLUMN IF EXISTS "failure_count"
    `);

    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      DROP COLUMN IF EXISTS "last_successful_health_check_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      DROP COLUMN IF EXISTS "last_health_check_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      DROP COLUMN IF EXISTS "health_status"
    `);
  }
}
