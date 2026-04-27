import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppPolicyCatalog1776900000000 implements MigrationInterface {
  name = 'AppPolicyCatalog1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_policy_apps" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "platform" text DEFAULT 'android' NOT NULL,
        "name" text NOT NULL,
        "package_name" text NOT NULL,
        "category" text,
        "notes" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_3cab78623d9c14b238de5cc00c9" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_019514f33d8ab9053b8ff975cb1" UNIQUE ("package_name")
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_1341f450b5e8aab38f886fd7d2" ON "app_policy_apps" ("platform")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_9b9e63050dac8127625006f949" ON "app_policy_apps" ("name")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_42c45da6aab5e4078d51743955" ON "app_policy_apps" ("category")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_b31d4e256a92927e94fa778528" ON "app_policy_apps" ("is_active")',
    );

    await this.seedApps(queryRunner);
    await this.seedPolicies(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "app_policy_apps"');
  }

  private async seedApps(queryRunner: QueryRunner): Promise<void> {
    const apps = [
      ['Telegram', 'org.telegram.messenger', 'messenger'],
      ['WhatsApp', 'com.whatsapp', 'messenger'],
      ['YouTube', 'com.google.android.youtube', 'streaming'],
      ['TikTok', 'com.zhiliaoapp.musically', 'social'],
      ['Instagram', 'com.instagram.android', 'social'],
      ['Netflix', 'com.netflix.mediaclient', 'streaming'],
      ['Spotify', 'com.spotify.music', 'streaming'],
      ['Chrome', 'com.android.chrome', 'browser'],
    ];

    for (const [name, packageName, category] of apps) {
      await queryRunner.query(
        `
          INSERT INTO "app_policy_apps" ("name", "package_name", "category")
          VALUES ($1, $2, $3)
          ON CONFLICT ("package_name") DO NOTHING
        `,
        [name, packageName, category],
      );
    }
  }

  private async seedPolicies(queryRunner: QueryRunner): Promise<void> {
    const defaultApps = [
      'org.telegram.messenger',
      'com.whatsapp',
      'com.google.android.youtube',
      'com.zhiliaoapp.musically',
    ];

    await queryRunner.query(
      `
        INSERT INTO "policy_templates" ("name", "type", "payload_json", "is_default")
        SELECT $1, $2, $3::jsonb, true
        WHERE NOT EXISTS (
          SELECT 1 FROM "policy_templates" WHERE "type" = $2 AND "is_default" = true
        )
      `,
      [
        'Default selected apps',
        'routing',
        JSON.stringify({
          version: 1,
          mode: 'selected_apps',
          includedApps: defaultApps,
          excludedApps: [],
        }),
      ],
    );

    await queryRunner.query(
      `
        INSERT INTO "policy_templates" ("name", "type", "payload_json", "is_default")
        SELECT $1, $2, $3::jsonb, true
        WHERE NOT EXISTS (
          SELECT 1 FROM "policy_templates" WHERE "type" = $2 AND "is_default" = true
        )
      `,
      [
        'Default auto connect',
        'automation',
        JSON.stringify({
          version: 1,
          autoConnectApps: defaultApps,
          autoDisconnectApps: [],
          requiresUsageAccess: true,
        }),
      ],
    );
  }
}
