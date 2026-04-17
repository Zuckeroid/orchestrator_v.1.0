import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { PlanEntity } from '../../database/entities/plan.entity';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanEntity, ProvisionEntity]),
    AuditLogsModule,
  ],
  controllers: [PlansController],
  providers: [PlansService, AdminApiKeyGuard],
  exports: [PlansService],
})
export class PlansModule {}
