import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ProvisionsController } from './provisions.controller';
import { ProvisionsService } from './provisions.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProvisionEntity]), AuditLogsModule],
  controllers: [ProvisionsController],
  providers: [ProvisionsService, AdminApiKeyGuard],
  exports: [ProvisionsService],
})
export class ProvisionsModule {}
