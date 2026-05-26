import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { TransportProfileEntity } from '../../database/entities/transport-profile.entity';
import { VpnNodeEntity } from '../../database/entities/vpn-node.entity';
import { VpnModule } from '../../integrations/vpn/vpn.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ProvisionsModule } from '../provisions/provisions.module';
import { TransportProfilesService } from './transport-profiles.service';
import { VpnNodesController } from './vpn-nodes.controller';
import { VpnNodesService } from './vpn-nodes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransportProfileEntity, VpnNodeEntity]),
    VpnModule,
    ProvisionsModule,
    AuditLogsModule,
  ],
  controllers: [VpnNodesController],
  providers: [TransportProfilesService, VpnNodesService, AdminApiKeyGuard],
  exports: [TransportProfilesService, VpnNodesService],
})
export class NodesModule {}
