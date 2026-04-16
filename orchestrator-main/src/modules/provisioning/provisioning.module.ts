import { Module } from '@nestjs/common';
import { BillingModule } from '../../integrations/billing/billing.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { VpnModule } from '../../integrations/vpn/vpn.module';
import { NodesModule } from '../nodes/nodes.module';
import { PlansModule } from '../plans/plans.module';
import { ProvisionsModule } from '../provisions/provisions.module';
import { StorageBackendsModule } from '../storage-backends/storage-backends.module';
import { ProvisioningService } from './provisioning.service';

@Module({
  imports: [
    BillingModule,
    VpnModule,
    StorageModule,
    PlansModule,
    ProvisionsModule,
    NodesModule,
    StorageBackendsModule,
  ],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
