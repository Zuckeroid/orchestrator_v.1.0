import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { StorageBackendEntity } from '../../database/entities/storage-backend.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { StorageBackendsController } from './storage-backends.controller';
import { StorageBackendsService } from './storage-backends.service';

@Module({
  imports: [TypeOrmModule.forFeature([StorageBackendEntity]), AuditLogsModule],
  controllers: [StorageBackendsController],
  providers: [StorageBackendsService, AdminApiKeyGuard],
  exports: [StorageBackendsService],
})
export class StorageBackendsModule {}
