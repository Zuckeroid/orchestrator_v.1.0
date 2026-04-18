import { MigrationInterface, QueryRunner } from 'typeorm';

export class NodeSubscriptionBaseAndExpiry1776500000000 implements MigrationInterface {
  name = 'NodeSubscriptionBaseAndExpiry1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      ADD COLUMN IF NOT EXISTS "subscription_base_url" text
    `);

    await queryRunner.query(`
      ALTER TABLE "provisions"
      ADD COLUMN IF NOT EXISTS "service_expires_at" timestamp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "provisions"
      DROP COLUMN IF EXISTS "service_expires_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "vpn_nodes"
      DROP COLUMN IF EXISTS "subscription_base_url"
    `);
  }
}
