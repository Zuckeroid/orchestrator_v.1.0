import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairEmptyRoutingPolicy1777400000000
  implements MigrationInterface
{
  name = 'RepairEmptyRoutingPolicy1777400000000';

  private readonly defaultRoutingPolicy = {
    version: 1,
    mode: 'selected_apps',
    includedApps: [
      'com.android.chrome',
      'org.telegram.messenger',
      'com.whatsapp',
      'com.instagram.android',
      'com.zhiliaoapp.musically',
      'com.netflix.mediaclient',
      'com.spotify.music',
      'com.google.android.youtube',
      'com.google.android.apps.youtube.music',
      'ru.yandex.music',
      'deezer.android.app',
      'com.soundcloud.android',
      'com.aspiro.tidal',
    ],
    excludedApps: [],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.repairPolicyTemplates(queryRunner);
    await this.repairDeviceConfigs(queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    return;
  }

  private async repairPolicyTemplates(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        UPDATE "policy_templates"
        SET "payload_json" = $1::jsonb
        WHERE "type" = 'routing'
          AND "is_default" = true
          AND COALESCE("payload_json"->>'mode', 'selected_apps') = 'selected_apps'
          AND (
            CASE
              WHEN jsonb_typeof("payload_json"->'includedApps') = 'array'
                THEN jsonb_array_length("payload_json"->'includedApps') = 0
              ELSE true
            END
          )
      `,
      [JSON.stringify(this.defaultRoutingPolicy)],
    );
  }

  private async repairDeviceConfigs(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        UPDATE "device_configs"
        SET "routing_policy_json" = $1::jsonb
        WHERE "status" IN ('pending', 'ready', 'active')
          AND COALESCE("routing_policy_json"->>'mode', 'selected_apps') = 'selected_apps'
          AND (
            CASE
              WHEN jsonb_typeof("routing_policy_json"->'includedApps') = 'array'
                THEN jsonb_array_length("routing_policy_json"->'includedApps') = 0
              ELSE true
            END
          )
      `,
      [JSON.stringify(this.defaultRoutingPolicy)],
    );
  }
}
