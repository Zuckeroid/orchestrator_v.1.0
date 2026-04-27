import { MigrationInterface, QueryRunner } from 'typeorm';

export class RussianAppPolicyCatalog1777200000000 implements MigrationInterface {
  name = 'RussianAppPolicyCatalog1777200000000';

  private readonly sensitivePackages = [
    'ru.rostel',
    'ru.nalog.lkfl',
    'com.gnivc.nalog.prof',
    'ru.sberbankmobile',
    'com.idamob.tinkoff.android',
    'ru.alfabank.mobile.android',
    'ru.vtb24.mobilebanking.android',
    'ru.gazprombank.android.mobilebank.app',
    'ru.nspk.mirpay',
    'ru.ozon.app.android',
    'com.wildberries.ru',
    'ru.beru.android',
    'com.avito.android',
    'ru.yandex.taxi',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const apps = [
      [
        'Gosuslugi',
        'ru.rostel',
        'government',
        'https://www.google.com/s2/favicons?sz=64&domain=gosuslugi.ru',
      ],
      [
        'Nalog FL',
        'ru.nalog.lkfl',
        'tax',
        'https://www.google.com/s2/favicons?sz=64&domain=nalog.gov.ru',
      ],
      [
        'Moi Nalog',
        'com.gnivc.nalog.prof',
        'tax',
        'https://www.google.com/s2/favicons?sz=64&domain=npd.nalog.ru',
      ],
      [
        'Sberbank Online',
        'ru.sberbankmobile',
        'banking',
        'https://www.google.com/s2/favicons?sz=64&domain=sberbank.ru',
      ],
      [
        'T-Bank',
        'com.idamob.tinkoff.android',
        'banking',
        'https://www.google.com/s2/favicons?sz=64&domain=tbank.ru',
      ],
      [
        'Alfa-Bank',
        'ru.alfabank.mobile.android',
        'banking',
        'https://www.google.com/s2/favicons?sz=64&domain=alfabank.ru',
      ],
      [
        'VTB Online',
        'ru.vtb24.mobilebanking.android',
        'banking',
        'https://www.google.com/s2/favicons?sz=64&domain=vtb.ru',
      ],
      [
        'Gazprombank',
        'ru.gazprombank.android.mobilebank.app',
        'banking',
        'https://www.google.com/s2/favicons?sz=64&domain=gazprombank.ru',
      ],
      [
        'Mir Pay',
        'ru.nspk.mirpay',
        'payments',
        'https://www.google.com/s2/favicons?sz=64&domain=mironline.ru',
      ],
      [
        'Ozon',
        'ru.ozon.app.android',
        'marketplace',
        'https://www.google.com/s2/favicons?sz=64&domain=ozon.ru',
      ],
      [
        'Wildberries',
        'com.wildberries.ru',
        'marketplace',
        'https://www.google.com/s2/favicons?sz=64&domain=wildberries.ru',
      ],
      [
        'Yandex Market',
        'ru.beru.android',
        'marketplace',
        'https://www.google.com/s2/favicons?sz=64&domain=market.yandex.ru',
      ],
      [
        'Avito',
        'com.avito.android',
        'marketplace',
        'https://www.google.com/s2/favicons?sz=64&domain=avito.ru',
      ],
      [
        'Yandex Go',
        'ru.yandex.taxi',
        'transport',
        'https://www.google.com/s2/favicons?sz=64&domain=taxi.yandex.ru',
      ],
      [
        '2GIS',
        'ru.dublgis.dgismobile',
        'maps',
        'https://www.google.com/s2/favicons?sz=64&domain=2gis.ru',
      ],
      [
        'Yandex Maps',
        'ru.yandex.yandexmaps',
        'maps',
        'https://www.google.com/s2/favicons?sz=64&domain=yandex.ru',
      ],
      [
        'My MTS',
        'ru.mts.mymts',
        'telecom',
        'https://www.google.com/s2/favicons?sz=64&domain=mts.ru',
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

    const templates = await queryRunner.query(
      `
        SELECT "id", "payload_json"
        FROM "policy_templates"
        WHERE "type" = 'automation'
          AND "is_default" = true
      `,
    );

    for (const template of templates) {
      const payload = template.payload_json ?? {};
      const current = Array.isArray(payload.autoDisconnectApps)
        ? payload.autoDisconnectApps.filter((item: unknown) => typeof item === 'string')
        : [];
      const autoDisconnectApps = Array.from(
        new Set([...current, ...this.sensitivePackages]),
      ).sort((left, right) => left.localeCompare(right));

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
            autoDisconnectApps,
            requiresUsageAccess: true,
          }),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const templates = await queryRunner.query(
      `
        SELECT "id", "payload_json"
        FROM "policy_templates"
        WHERE "type" = 'automation'
      `,
    );

    for (const template of templates) {
      const payload = template.payload_json ?? {};
      const current = Array.isArray(payload.autoDisconnectApps)
        ? payload.autoDisconnectApps.filter((item: unknown) => typeof item === 'string')
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
            autoDisconnectApps: current.filter(
              (item: string) => !this.sensitivePackages.includes(item),
            ),
          }),
        ],
      );
    }

    await queryRunner.query(
      `
        DELETE FROM "app_policy_apps"
        WHERE "package_name" = ANY($1::text[])
      `,
      [this.sensitivePackages],
    );
  }
}
