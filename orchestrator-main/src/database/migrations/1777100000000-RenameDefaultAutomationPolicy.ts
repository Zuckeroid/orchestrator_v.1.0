import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameDefaultAutomationPolicy1777100000000
  implements MigrationInterface
{
  name = 'RenameDefaultAutomationPolicy1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        UPDATE "policy_templates"
        SET "name" = 'Default automation'
        WHERE "type" = 'automation'
          AND "name" = 'Default auto connect'
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        UPDATE "policy_templates"
        SET "name" = 'Default auto connect'
        WHERE "type" = 'automation'
          AND "name" = 'Default automation'
      `,
    );
  }
}
