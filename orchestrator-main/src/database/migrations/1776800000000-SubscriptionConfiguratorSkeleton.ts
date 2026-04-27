import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriptionConfiguratorSkeleton1776800000000
  implements MigrationInterface
{
  name = 'SubscriptionConfiguratorSkeleton1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_configs" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "provision_id" uuid NOT NULL,
        "device_id" text,
        "order_id" text,
        "client_id" text,
        "install_id" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "runtime_type" text,
        "runtime_payload" text,
        "protocol" text,
        "node_id" uuid,
        "config_revision" text,
        "routing_policy_json" jsonb,
        "automation_policy_json" jsonb,
        "telemetry_profile_json" jsonb,
        "last_error" text,
        "generated_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_5b7945230eff9f7469d74de76fd" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_accesses" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "device_config_id" uuid NOT NULL,
        "provider" text NOT NULL,
        "provider_user_id" text,
        "provider_login" text,
        "provider_metadata_json" jsonb,
        "status" text DEFAULT 'pending' NOT NULL,
        "last_synced_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_0d7a0ca669b0de95008ef2f0e7d" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "policy_templates" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "name" text NOT NULL,
        "type" text NOT NULL,
        "payload_json" jsonb NOT NULL,
        "is_default" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_328ca8d61284fa2f504f24d5088" PRIMARY KEY ("id")
      )
    `);

    await this.createIndexes(queryRunner);
    await this.createForeignKeys(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "provider_accesses"');
    await queryRunner.query('DROP TABLE IF EXISTS "device_configs"');
    await queryRunner.query('DROP TABLE IF EXISTS "policy_templates"');
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_0a2bb5aefdf3e88001520341b7" ON "device_configs" ("provision_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_0ab8d5fa2fa6774ca2d9c7ef40" ON "device_configs" ("device_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_5728b8b48067963b5db45183b5" ON "device_configs" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_8c6041ce89076c693ec9616f8d" ON "device_configs" ("node_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_d7624fe04103711f1602a8b924" ON "device_configs" ("config_revision")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_a0a64dc8239de5250e83f8d986" ON "provider_accesses" ("device_config_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_e4102974df4d51431f1d2f632b" ON "provider_accesses" ("provider")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_07ec4df5c7cf39b193d67f89cf" ON "provider_accesses" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_1536b7d31f9e8aef0eb53963e3" ON "policy_templates" ("name")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_7095abf7548947f769c2be00e1" ON "policy_templates" ("type")',
    );
  }

  private async createForeignKeys(queryRunner: QueryRunner): Promise<void> {
    await this.createForeignKeyIfMissing(
      queryRunner,
      'FK_0a2bb5aefdf3e88001520341b77',
      'ALTER TABLE "device_configs" ADD CONSTRAINT "FK_0a2bb5aefdf3e88001520341b77" FOREIGN KEY ("provision_id") REFERENCES "provisions"("id") ON DELETE CASCADE',
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'FK_8c6041ce89076c693ec9616f8d4',
      'ALTER TABLE "device_configs" ADD CONSTRAINT "FK_8c6041ce89076c693ec9616f8d4" FOREIGN KEY ("node_id") REFERENCES "vpn_nodes"("id")',
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'FK_a0a64dc8239de5250e83f8d986d',
      'ALTER TABLE "provider_accesses" ADD CONSTRAINT "FK_a0a64dc8239de5250e83f8d986d" FOREIGN KEY ("device_config_id") REFERENCES "device_configs"("id") ON DELETE CASCADE',
    );
  }

  private async createForeignKeyIfMissing(
    queryRunner: QueryRunner,
    name: string,
    sql: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = '${name}'
        ) THEN
          ${sql};
        END IF;
      END
      $$;
    `);
  }
}
