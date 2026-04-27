import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { DeviceConfigEntity } from '../../database/entities/device-config.entity';
import { PolicyTemplateEntity } from '../../database/entities/policy-template.entity';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { ConfiguratorController } from './configurator.controller';
import { ConfiguratorService } from './configurator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceConfigEntity,
      PolicyTemplateEntity,
      ProvisionEntity,
    ]),
  ],
  controllers: [ConfiguratorController],
  providers: [ConfiguratorService, AdminApiKeyGuard],
  exports: [ConfiguratorService],
})
export class ConfiguratorModule {}
