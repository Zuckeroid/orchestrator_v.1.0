import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { BillingEventPayload } from '../common/types/billing-event.type';

@Injectable()
export class QueueService {
  constructor(@InjectQueue('billing-events') private queue: Queue) {}

  async addBillingEventJob(data: BillingEventPayload) {
    await this.queue.add(data.event, data, {
      jobId: data.eventId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    });
  }
}
