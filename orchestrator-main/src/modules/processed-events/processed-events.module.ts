import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { ProcessedEventEntity } from '../../database/entities/processed-event.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ProcessedEventsController } from './processed-events.controller';
import { ProcessedEventsService } from './processed-events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProcessedEventEntity]),
    BullModule.registerQueue({
      name: 'billing-events',
    }),
    AuditLogsModule,
  ],
  controllers: [ProcessedEventsController],
  providers: [ProcessedEventsService, AdminApiKeyGuard],
  exports: [ProcessedEventsService],
})
export class ProcessedEventsModule {}
