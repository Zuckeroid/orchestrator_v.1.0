import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { AppPolicyAppEntity } from '../../database/entities/app-policy-app.entity';
import { DeviceConfigEntity } from '../../database/entities/device-config.entity';
import { DomainEndpointEntity } from '../../database/entities/domain-endpoint.entity';
import { PolicyTemplateEntity } from '../../database/entities/policy-template.entity';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { ProviderAccessEntity } from '../../database/entities/provider-access.entity';
import { BillingModule } from '../../integrations/billing/billing.module';
import { VpnModule } from '../../integrations/vpn/vpn.module';
import { NodesModule } from '../nodes/nodes.module';
import { ConfiguratorController } from './configurator.controller';
import { ConfiguratorRuntimeService } from './configurator-runtime.service';
import { ConfiguratorService } from './configurator.service';
import { DomainEndpointsService } from './domain-endpoints.service';

@Module({
  imports: [
    BillingModule,
    VpnModule,
    NodesModule,
    TypeOrmModule.forFeature([
      AppPolicyAppEntity,
      DeviceConfigEntity,
      DomainEndpointEntity,
      PolicyTemplateEntity,
      ProvisionEntity,
      ProviderAccessEntity,
    ]),
  ],
  controllers: [ConfiguratorController],
  providers: [
    ConfiguratorService,
    ConfiguratorRuntimeService,
    DomainEndpointsService,
    AdminApiKeyGuard,
  ],
  exports: [ConfiguratorService, ConfiguratorRuntimeService],
})
export class ConfiguratorModule {}
