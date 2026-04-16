import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { JobEntity } from '../../database/entities/job.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobEntity]),
    BullModule.registerQueue({
      name: 'billing-events',
    }),
  ],
  controllers: [JobsController],
  providers: [JobsService, AdminApiKeyGuard],
})
export class JobsModule {}
