import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppPolicyAppIcons1777000000000 implements MigrationInterface {
  name = 'AppPolicyAppIcons1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE IF EXISTS "app_policy_apps" ADD COLUMN IF NOT EXISTS "icon_url" text',
    );

    const icons = [
      [
        'org.telegram.messenger',
        'https://www.google.com/s2/favicons?sz=64&domain=telegram.org',
      ],
      ['com.whatsapp', 'https://www.google.com/s2/favicons?sz=64&domain=whatsapp.com'],
      [
        'com.google.android.youtube',
        'https://www.google.com/s2/favicons?sz=64&domain=youtube.com',
      ],
      [
        'com.zhiliaoapp.musically',
        'https://www.google.com/s2/favicons?sz=64&domain=tiktok.com',
      ],
      [
        'com.instagram.android',
        'https://www.google.com/s2/favicons?sz=64&domain=instagram.com',
      ],
      [
        'com.netflix.mediaclient',
        'https://www.google.com/s2/favicons?sz=64&domain=netflix.com',
      ],
      [
        'com.spotify.music',
        'https://www.google.com/s2/favicons?sz=64&domain=spotify.com',
      ],
      [
        'com.android.chrome',
        'https://www.google.com/s2/favicons?sz=64&domain=google.com',
      ],
    ];

    for (const [packageName, iconUrl] of icons) {
      await queryRunner.query(
        `
          UPDATE "app_policy_apps"
          SET "icon_url" = $2
          WHERE "package_name" = $1
            AND ("icon_url" IS NULL OR "icon_url" = '')
        `,
        [packageName, iconUrl],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE IF EXISTS "app_policy_apps" DROP COLUMN IF EXISTS "icon_url"',
    );
  }
}
