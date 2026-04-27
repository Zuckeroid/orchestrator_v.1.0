import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdditionalAppPolicyCatalog1777300000000 implements MigrationInterface {
  name = 'AdditionalAppPolicyCatalog1777300000000';

  private readonly vpnSelectedPackages = ['deezer.android.app'];
  private readonly sensitivePackages = ['ru.zhuck.webapp'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const apps = [
      [
        'Tochka Bank',
        'ru.zhuck.webapp',
        'banking',
        'https://www.google.com/s2/favicons?sz=64&domain=tochka.com',
      ],
      [
        'Deezer',
        'deezer.android.app',
        'streaming',
        'https://www.google.com/s2/favicons?sz=64&domain=deezer.com',
      ],
      [
        'YouTube Music',
        'com.google.android.apps.youtube.music',
        'streaming',
        'https://www.google.com/s2/favicons?sz=64&domain=music.youtube.com',
      ],
      [
        'Yandex Music',
        'ru.yandex.music',
        'streaming',
        'https://www.google.com/s2/favicons?sz=64&domain=music.yandex.ru',
      ],
      [
        'SoundCloud',
        'com.soundcloud.android',
        'streaming',
        'https://www.google.com/s2/favicons?sz=64&domain=soundcloud.com',
      ],
      [
        'TIDAL',
        'com.aspiro.tidal',
        'streaming',
        'https://www.google.com/s2/favicons?sz=64&domain=tidal.com',
      ],
    ];

    for (const [name, packageName, category, iconUrl] of apps) {
      await queryRunner.query(
        `
          INSERT INTO "app_policy_apps"
            ("name", "package_name", "category", "icon_url")
          VALUES ($1, $2, $3, $4)
          ON CONFLICT ("package_name") DO UPDATE
          SET "name" = EXCLUDED."name",
              "category" = EXCLUDED."category",
              "icon_url" = COALESCE("app_policy_apps"."icon_url", EXCLUDED."icon_url")
        `,
        [name, packageName, category, iconUrl],
      );
    }

    await this.appendPackagesToDefaultPolicy(
      queryRunner,
      'routing',
      'includedApps',
      this.vpnSelectedPackages,
    );
    await this.appendPackagesToDefaultPolicy(
      queryRunner,
      'automation',
      'autoDisconnectApps',
      this.sensitivePackages,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.removePackagesFromPolicy(
      queryRunner,
      'routing',
      'includedApps',
      this.vpnSelectedPackages,
    );
    await this.removePackagesFromPolicy(
      queryRunner,
      'automation',
      'autoDisconnectApps',
      this.sensitivePackages,
    );

    await queryRunner.query(
      `
        DELETE FROM "app_policy_apps"
        WHERE "package_name" = ANY($1::text[])
      `,
      [
        [
          'ru.zhuck.webapp',
          'deezer.android.app',
          'com.google.android.apps.youtube.music',
          'ru.yandex.music',
          'com.soundcloud.android',
          'com.aspiro.tidal',
        ],
      ],
    );
  }

  private async appendPackagesToDefaultPolicy(
    queryRunner: QueryRunner,
    type: string,
    key: string,
    packages: string[],
  ): Promise<void> {
    const templates = await queryRunner.query(
      `
        SELECT "id", "payload_json"
        FROM "policy_templates"
        WHERE "type" = $1
          AND "is_default" = true
      `,
      [type],
    );

    for (const template of templates) {
      const payload = template.payload_json ?? {};
      const current = Array.isArray(payload[key])
        ? payload[key].filter((item: unknown) => typeof item === 'string')
        : [];
      const next = Array.from(new Set([...current, ...packages])).sort(
        (left, right) => left.localeCompare(right),
      );

      await queryRunner.query(
        `
          UPDATE "policy_templates"
          SET "payload_json" = $2::jsonb
          WHERE "id" = $1
        `,
        [
          template.id,
          JSON.stringify({
            ...payload,
            [key]: next,
          }),
        ],
      );
    }
  }

  private async removePackagesFromPolicy(
    queryRunner: QueryRunner,
    type: string,
    key: string,
    packages: string[],
  ): Promise<void> {
    const templates = await queryRunner.query(
      `
        SELECT "id", "payload_json"
        FROM "policy_templates"
        WHERE "type" = $1
      `,
      [type],
    );

    for (const template of templates) {
      const payload = template.payload_json ?? {};
      const current = Array.isArray(payload[key])
        ? payload[key].filter((item: unknown) => typeof item === 'string')
        : [];

      await queryRunner.query(
        `
          UPDATE "policy_templates"
          SET "payload_json" = $2::jsonb
          WHERE "id" = $1
        `,
        [
          template.id,
          JSON.stringify({
            ...payload,
            [key]: current.filter((item: string) => !packages.includes(item)),
          }),
        ],
      );
    }
  }
}
