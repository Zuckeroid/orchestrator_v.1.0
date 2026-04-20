import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueService } from './queue.service';
import { BillingWorker } from './billing.worker';
import { ProvisioningModule } from '../modules/provisioning/provisioning.module';
import { ProcessedEventsModule } from '../modules/processed-events/processed-events.module';
import { NodesModule } from '../modules/nodes/nodes.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'billing-events',
    }),
    ProvisioningModule,
    ProcessedEventsModule,
    NodesModule,
  ],
  providers: [
    QueueService,
    BillingWorker,
  ],
  exports: [QueueService],
})
export class QueueModule {}
