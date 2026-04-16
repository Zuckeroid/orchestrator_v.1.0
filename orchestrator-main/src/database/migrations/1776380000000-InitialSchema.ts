import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1776380000000 implements MigrationInterface {
  name = 'InitialSchema1776380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plans" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "external_plan_id" text NOT NULL,
        "billing_provider" text,
        "name" text NOT NULL,
        "vpn_enabled" boolean DEFAULT true NOT NULL,
        "storage_enabled" boolean DEFAULT true NOT NULL,
        "max_devices" integer,
        "storage_size" bigint,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_4df65f16de9f9ca517b12b095ef" UNIQUE ("external_plan_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vpn_nodes" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "name" text,
        "host" text NOT NULL,
        "api_key" text NOT NULL,
        "api_version" text,
        "inbound_id" integer,
        "type" text DEFAULT '3x-ui' NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "last_error" text,
        "capacity" integer NOT NULL,
        "current_load" integer DEFAULT 0 NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_506246f8724e5e5a80bd2383896" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "storage_backends" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "name" text,
        "endpoint" text NOT NULL,
        "api_key" text NOT NULL,
        "secret_key" text,
        "region" text,
        "provider" text DEFAULT 'minio' NOT NULL,
        "bucket_prefix" text,
        "capacity" integer NOT NULL,
        "current_load" integer DEFAULT 0 NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_db13f66d069f9b9e1dcc8e3148c" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "processed_events" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "event_id" text NOT NULL,
        "event_type" text NOT NULL,
        "external_user_id" text,
        "external_subscription_id" text,
        "external_order_id" text,
        "external_payment_id" text,
        "external_plan_id" text,
        "payload" jsonb NOT NULL,
        "status" text NOT NULL,
        "error" text,
        "received_at" timestamp DEFAULT now() NOT NULL,
        "processed_at" timestamp,
        CONSTRAINT "PK_a08d68aa0747daea9efd2ddea53" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_585a690352092645ee665d70ac2" UNIQUE ("event_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provisions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "external_user_id" text NOT NULL,
        "external_subscription_id" text NOT NULL,
        "external_order_id" text,
        "last_external_payment_id" text,
        "email" text NOT NULL,
        "plan_id" uuid,
        "vpn_node_id" uuid,
        "storage_backend_id" uuid,
        "vpn_login" text,
        "vpn_password" text,
        "subscription_link" text,
        "storage_bucket" text,
        "storage_credentials_encrypted" jsonb,
        "storage_status" text DEFAULT 'none' NOT NULL,
        "delete_after" timestamp,
        "status" text NOT NULL,
        "error" text,
        "suspended_at" timestamp,
        "deleted_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_6ec9c596e6052e5f311248bbf3c" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_93b27a9f31e4ac2b85e7a354444" UNIQUE ("external_subscription_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jobs" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "type" text NOT NULL,
        "payload" jsonb NOT NULL,
        "processed_event_id" uuid,
        "status" text NOT NULL,
        "error" text,
        "attempts" integer DEFAULT 0 NOT NULL,
        "processed_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "actor" text,
        "request_id" text,
        "entity_type" text NOT NULL,
        "entity_id" uuid,
        "action" text NOT NULL,
        "data" jsonb,
        "before_data" jsonb,
        "after_data" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id")
      )
    `);

    await this.createIndexes(queryRunner);
    await this.createForeignKeys(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "audit_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "jobs"');
    await queryRunner.query('DROP TABLE IF EXISTS "provisions"');
    await queryRunner.query('DROP TABLE IF EXISTS "processed_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "storage_backends"');
    await queryRunner.query('DROP TABLE IF EXISTS "vpn_nodes"');
    await queryRunner.query('DROP TABLE IF EXISTS "plans"');
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_e81355e5ffa6c9980e9c009eec" ON "processed_events" ("external_subscription_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_5d192db56e791f931be5f4dd9e" ON "processed_events" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_317ca322c0d906fd9b9fe4f201" ON "provisions" ("external_user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_161d8f0f159becc0006abe2441" ON "provisions" ("vpn_node_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_5db4c59d154ec2268fa5882d91" ON "provisions" ("storage_backend_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_f51d7904f28b06b2e11189dc9d" ON "provisions" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_dfe72f6bcc41beb1f3ea943ef7" ON "vpn_nodes" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_b992b79a7f86ca4227e8d91446" ON "vpn_nodes" ("current_load")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_4cff4b360a977ff8fd2404dfa2" ON "vpn_nodes" ("is_active")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_da27efe54ea8ff84fd19082b90" ON "storage_backends" ("current_load")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_b808bf3648b637188e8d0431bd" ON "storage_backends" ("is_active")',
    );
  }

  private async createForeignKeys(queryRunner: QueryRunner): Promise<void> {
    await this.createForeignKeyIfMissing(
      queryRunner,
      'FK_4deb5eb7cc58cdce8349bb2dce4',
      'ALTER TABLE "provisions" ADD CONSTRAINT "FK_4deb5eb7cc58cdce8349bb2dce4" FOREIGN KEY ("plan_id") REFERENCES "plans"("id")',
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'FK_161d8f0f159becc0006abe2441e',
      'ALTER TABLE "provisions" ADD CONSTRAINT "FK_161d8f0f159becc0006abe2441e" FOREIGN KEY ("vpn_node_id") REFERENCES "vpn_nodes"("id")',
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'FK_5db4c59d154ec2268fa5882d917',
      'ALTER TABLE "provisions" ADD CONSTRAINT "FK_5db4c59d154ec2268fa5882d917" FOREIGN KEY ("storage_backend_id") REFERENCES "storage_backends"("id")',
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'FK_079b60b13c5bf61299d785cbb77',
      'ALTER TABLE "jobs" ADD CONSTRAINT "FK_079b60b13c5bf61299d785cbb77" FOREIGN KEY ("processed_event_id") REFERENCES "processed_events"("id")',
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
