import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { DeviceConfigEntity } from '../../database/entities/device-config.entity';
import { PolicyTemplateEntity } from '../../database/entities/policy-template.entity';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { ProviderAccessEntity } from '../../database/entities/provider-access.entity';
import { ConfiguratorController } from './configurator.controller';
import { ConfiguratorRuntimeService } from './configurator-runtime.service';
import { ConfiguratorService } from './configurator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceConfigEntity,
      PolicyTemplateEntity,
      ProvisionEntity,
      ProviderAccessEntity,
    ]),
  ],
  controllers: [ConfiguratorController],
  providers: [ConfiguratorService, ConfiguratorRuntimeService, AdminApiKeyGuard],
  exports: [ConfiguratorService, ConfiguratorRuntimeService],
})
export class ConfiguratorModule {}
