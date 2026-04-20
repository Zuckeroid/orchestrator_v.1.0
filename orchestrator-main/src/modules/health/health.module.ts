import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'billing-events',
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
