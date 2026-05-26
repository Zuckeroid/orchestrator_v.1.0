import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransportProfiles1777900000000 implements MigrationInterface {
  name = 'TransportProfiles1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transport_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "node_id" uuid NOT NULL,
        "name" text NOT NULL,
        "provider" text NOT NULL DEFAULT '3x-ui',
        "provider_inbound_id" integer,
        "protocol" text NOT NULL,
        "transport" text NOT NULL,
        "security" text NOT NULL,
        "port" integer NOT NULL,
        "sni" text,
        "host_header" text,
        "path" text,
        "service_name" text,
        "alpn" text,
        "fingerprint" text,
        "flow" text,
        "public_key" text,
        "short_id" text,
        "spider_x" text,
        "priority" integer NOT NULL DEFAULT 100,
        "weight" integer NOT NULL DEFAULT 100,
        "status" text NOT NULL DEFAULT 'draft',
        "last_check_at" TIMESTAMP,
        "last_error" text,
        "metadata_json" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transport_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transport_profiles_node"
          FOREIGN KEY ("node_id") REFERENCES "vpn_nodes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_transport_profiles_node_id" ON "transport_profiles" ("node_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_transport_profiles_provider_inbound_id" ON "transport_profiles" ("provider_inbound_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_transport_profiles_protocol" ON "transport_profiles" ("protocol")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_transport_profiles_transport" ON "transport_profiles" ("transport")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_transport_profiles_security" ON "transport_profiles" ("security")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_transport_profiles_port" ON "transport_profiles" ("port")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_transport_profiles_priority" ON "transport_profiles" ("priority")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_transport_profiles_status" ON "transport_profiles" ("status")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "transport_profiles"');
  }
}

