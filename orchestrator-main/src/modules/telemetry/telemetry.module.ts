import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { NetworkTelemetryEventEntity } from '../../database/entities/network-telemetry-event.entity';
import { NetworkTelemetryHourlyEntity } from '../../database/entities/network-telemetry-hourly.entity';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NetworkTelemetryEventEntity,
      NetworkTelemetryHourlyEntity,
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService, AdminApiKeyGuard],
  exports: [TelemetryService],
})
export class TelemetryModule {}
