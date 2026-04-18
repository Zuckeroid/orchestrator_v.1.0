import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { VpnNodeEntity } from '../../database/entities/vpn-node.entity';
import { VpnModule } from '../../integrations/vpn/vpn.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ProvisionsModule } from '../provisions/provisions.module';
import { VpnNodesController } from './vpn-nodes.controller';
import { VpnNodesService } from './vpn-nodes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VpnNodeEntity]),
    VpnModule,
    ProvisionsModule,
    AuditLogsModule,
  ],
  controllers: [VpnNodesController],
  providers: [VpnNodesService, AdminApiKeyGuard],
  exports: [VpnNodesService],
})
export class NodesModule {}
