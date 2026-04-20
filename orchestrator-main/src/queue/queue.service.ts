import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { BillingEventPayload } from '../common/types/billing-event.type';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);

  constructor(@InjectQueue('billing-events') private queue: Queue) {}

  async onModuleInit() {
    if (
      (process.env.PROVISION_CLEANUP_ENABLED ?? 'true').toLowerCase() === 'true'
    ) {
      const cron = process.env.PROVISION_CLEANUP_CRON ?? '*/15 * * * *';
      const limit = Number(process.env.PROVISION_CLEANUP_LIMIT ?? 50);

      await this.queue.add(
        'cleanup_due_provisions',
        { limit },
        {
          jobId: 'cleanup-due-provisions',
          repeat: {
            cron,
          },
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      this.logger.log(`Provision cleanup scheduled with cron: ${cron}`);
    }

    if (
      (process.env.NODE_HEALTH_CHECK_ENABLED ?? 'true').toLowerCase() !== 'true'
    ) {
      return;
    }

    const cron = process.env.NODE_HEALTH_CHECK_CRON ?? '*/5 * * * *';

    await this.queue.add(
      'check_vpn_nodes_health',
      {},
      {
        jobId: 'check-vpn-nodes-health',
        repeat: {
          cron,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    this.logger.log(`VPN node health checks scheduled with cron: ${cron}`);
  }

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

  async addCleanupDueProvisionsJob(limit?: number) {
    await this.queue.add(
      'cleanup_due_provisions',
      {
        limit: limit ?? Number(process.env.PROVISION_CLEANUP_LIMIT ?? 50),
      },
      {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }

  async addNodeHealthCheckJob() {
    await this.queue.add(
      'check_vpn_nodes_health',
      {},
      {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }
}
