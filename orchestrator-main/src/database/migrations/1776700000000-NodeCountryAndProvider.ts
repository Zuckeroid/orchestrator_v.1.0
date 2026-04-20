import { MigrationInterface, QueryRunner } from 'typeorm';

export class NodeCountryAndProvider1776700000000
  implements MigrationInterface
{
  name = 'NodeCountryAndProvider1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vpn_nodes" ADD "country" text`);
    await queryRunner.query(
      `ALTER TABLE "vpn_nodes" ADD "vds_provider" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vpn_nodes" DROP COLUMN "vds_provider"`);
    await queryRunner.query(`ALTER TABLE "vpn_nodes" DROP COLUMN "country"`);
  }
}
