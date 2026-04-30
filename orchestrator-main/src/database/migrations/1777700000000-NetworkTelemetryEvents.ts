import { MigrationInterface, QueryRunner } from 'typeorm';

export class NetworkTelemetryEvents1777700000000
  implements MigrationInterface
{
  name = 'NetworkTelemetryEvents1777700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "network_telemetry_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "event_type" text NOT NULL,
        "result" text NOT NULL,
        "classification" text,
        "node_id" uuid,
        "node_name" text,
        "node_country" text,
        "node_host" text,
        "node_port" integer,
        "protocol" text,
        "transport" text,
        "network_type" text,
        "carrier_name" text,
        "mcc" text,
        "mnc" text,
        "app_version" text,
        "platform" text,
        "install_id_hash" text,
        "device_config_id" uuid,
        "latency_ms" integer,
        "error_code" text,
        "error_message" text,
        "details" jsonb,
        "observed_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_network_telemetry_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_event_type" ON "network_telemetry_events" ("event_type")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_result" ON "network_telemetry_events" ("result")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_classification" ON "network_telemetry_events" ("classification")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_node_id" ON "network_telemetry_events" ("node_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_node_country" ON "network_telemetry_events" ("node_country")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_network_type" ON "network_telemetry_events" ("network_type")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_carrier_name" ON "network_telemetry_events" ("carrier_name")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_network_telemetry_observed_at" ON "network_telemetry_events" ("observed_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "network_telemetry_events"');
  }
}
