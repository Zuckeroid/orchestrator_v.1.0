import { Module } from '@nestjs/common';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { BillingModule } from '../../integrations/billing/billing.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { VpnModule } from '../../integrations/vpn/vpn.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ConfiguratorModule } from '../configurator/configurator.module';
import { NodesModule } from '../nodes/nodes.module';
import { PlansModule } from '../plans/plans.module';
import { ProvisionsModule } from '../provisions/provisions.module';
import { StorageBackendsModule } from '../storage-backends/storage-backends.module';
import { ProvisioningAdminController } from './provisioning-admin.controller';
import { ProvisioningService } from './provisioning.service';

@Module({
  imports: [
    BillingModule,
    VpnModule,
    StorageModule,
    ConfiguratorModule,
    PlansModule,
    ProvisionsModule,
    NodesModule,
    StorageBackendsModule,
    AuditLogsModule,
  ],
  controllers: [ProvisioningAdminController],
  providers: [ProvisioningService, AdminApiKeyGuard],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
