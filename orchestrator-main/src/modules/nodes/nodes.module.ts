import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VpnNodeEntity } from '../../database/entities/vpn-node.entity';
import { ProvisionsModule } from '../provisions/provisions.module';
import { VpnNodesController } from './vpn-nodes.controller';
import { VpnNodesService } from './vpn-nodes.service';

@Module({
  imports: [TypeOrmModule.forFeature([VpnNodeEntity]), ProvisionsModule],
  controllers: [VpnNodesController],
  providers: [VpnNodesService],
  exports: [VpnNodesService],
})
export class NodesModule {}
