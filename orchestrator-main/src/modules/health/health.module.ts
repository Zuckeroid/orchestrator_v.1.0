import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'billing-events',
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}

