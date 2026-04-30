import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';

import { WebhookController } from './webhook/webhook.controller';
import { WebhookService } from './webhook/webhook.service';
import { QueueModule } from './queue/queue.module';
import { DatabaseModule } from './database/database.module';
import { ProcessedEventsModule } from './modules/processed-events/processed-events.module';
import { ConfiguratorModule } from './modules/configurator/configurator.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { PlansModule } from './modules/plans/plans.module';
import { ProvisionsModule } from './modules/provisions/provisions.module';
import { StorageBackendsModule } from './modules/storage-backends/storage-backends.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { validateEnv } from './config/validate-env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
      validate: validateEnv,
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    DatabaseModule,
    ProcessedEventsModule,
    ConfiguratorModule,
    PlansModule,
    ProvisionsModule,
    NodesModule,
    StorageBackendsModule,
    HealthModule,
    JobsModule,
    AuditLogsModule,
    TelemetryModule,
    QueueModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class AppModule {}
