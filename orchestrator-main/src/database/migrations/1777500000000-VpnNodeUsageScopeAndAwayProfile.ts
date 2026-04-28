import { MigrationInterface, QueryRunner } from 'typeorm';

export class VpnNodeUsageScopeAndAwayProfile1777500000000
  implements MigrationInterface
{
  name = 'VpnNodeUsageScopeAndAwayProfile1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE IF EXISTS "vpn_nodes" ADD COLUMN IF NOT EXISTS "usage_scope" text NOT NULL DEFAULT \'general\'',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_vpn_nodes_usage_scope" ON "vpn_nodes" ("usage_scope")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_vpn_nodes_usage_scope"');
    await queryRunner.query(
      'ALTER TABLE IF EXISTS "vpn_nodes" DROP COLUMN IF EXISTS "usage_scope"',
    );
  }
}
