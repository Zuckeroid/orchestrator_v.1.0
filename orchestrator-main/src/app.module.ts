import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';

import { WebhookController } from './webhook/webhook.controller';
import { WebhookService } from './webhook/webhook.service';
import { QueueModule } from './queue/queue.module';
import { DatabaseModule } from './database/database.module';
import { ProcessedEventsModule } from './modules/processed-events/processed-events.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { PlansModule } from './modules/plans/plans.module';
import { ProvisionsModule } from './modules/provisions/provisions.module';
import { StorageBackendsModule } from './modules/storage-backends/storage-backends.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    DatabaseModule,
    ProcessedEventsModule,
    PlansModule,
    ProvisionsModule,
    NodesModule,
    StorageBackendsModule,
    HealthModule,
    JobsModule,
    AuditLogsModule,
    QueueModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class AppModule {}
