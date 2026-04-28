import { MigrationInterface, QueryRunner } from 'typeorm';

export class DomainEndpointPool1777600000000 implements MigrationInterface {
  name = 'DomainEndpointPool1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "domain_endpoints" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purpose" text NOT NULL DEFAULT 'api',
        "role" text NOT NULL DEFAULT 'backup',
        "label" text,
        "url" text NOT NULL,
        "priority" integer NOT NULL DEFAULT 100,
        "is_active" boolean NOT NULL DEFAULT true,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_domain_endpoints" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_domain_endpoints_purpose_url" UNIQUE ("purpose", "url")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_domain_endpoints_purpose" ON "domain_endpoints" ("purpose")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_domain_endpoints_role" ON "domain_endpoints" ("role")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_domain_endpoints_priority" ON "domain_endpoints" ("priority")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_domain_endpoints_is_active" ON "domain_endpoints" ("is_active")',
    );
    await queryRunner.query(`
      INSERT INTO "domain_endpoints" ("purpose", "role", "label", "url", "priority", "is_active", "notes")
      VALUES
        ('api', 'primary', 'Billing API', 'https://my-storage.org', 10, true, 'Seed domain for app authentication'),
        ('web', 'primary', 'Client portal', 'https://my-storage.org', 10, true, 'Seed domain for sign up and client portal')
      ON CONFLICT ("purpose", "url") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "domain_endpoints"');
  }
}
