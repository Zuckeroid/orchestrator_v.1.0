import { MigrationInterface, QueryRunner } from 'typeorm';

export class NetworkTelemetryHourly1777800000000
  implements MigrationInterface
{
  name = 'NetworkTelemetryHourly1777800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "network_telemetry_hourly" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bucket_start" TIMESTAMP NOT NULL,
        "event_type" text NOT NULL,
        "node_id" uuid,
        "node_name" text,
        "node_country" text,
        "protocol" text,
        "transport" text,
        "network_type" text,
        "carrier_name" text,
        "classification" text,
        "total" integer NOT NULL DEFAULT 0,
        "success" integer NOT NULL DEFAULT 0,
        "failed" integer NOT NULL DEFAULT 0,
        "timeout" integer NOT NULL DEFAULT 0,
        "skipped" integer NOT NULL DEFAULT 0,
        "avg_latency_ms" integer,
        "last_observed_at" TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_network_telemetry_hourly" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_hourly_bucket" ON "network_telemetry_hourly" ("bucket_start")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_hourly_event_type" ON "network_telemetry_hourly" ("event_type")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_hourly_node_id" ON "network_telemetry_hourly" ("node_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_hourly_node_country" ON "network_telemetry_hourly" ("node_country")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_hourly_network_type" ON "network_telemetry_hourly" ("network_type")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_hourly_carrier_name" ON "network_telemetry_hourly" ("carrier_name")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_hourly_classification" ON "network_telemetry_hourly" ("classification")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "network_telemetry_hourly"');
  }
}
