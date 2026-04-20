import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { ProvisioningService } from '../modules/provisioning/provisioning.service';
import { BillingEventPayload } from '../common/types/billing-event.type';
import { ProcessedEventsService } from '../modules/processed-events/processed-events.service';
import { VpnNodesService } from '../modules/nodes/vpn-nodes.service';

@Injectable()
@Processor('billing-events')
export class BillingWorker {
  private readonly logger = new Logger(BillingWorker.name);

  constructor(
    private readonly provisioningService: ProvisioningService,
    private readonly processedEventsService: ProcessedEventsService,
    private readonly vpnNodesService: VpnNodesService,
  ) {}

  @Process('payment_paid')
  async handlePaymentPaid(job: Job<BillingEventPayload>) {
    return this.handleBillingEvent(job);
  }

  @Process('subscription_cancel')
  async handleSubscriptionCancel(job: Job<BillingEventPayload>) {
    return this.handleBillingEvent(job);
  }

  @Process('subscription_expired')
  async handleSubscriptionExpired(job: Job<BillingEventPayload>) {
    return this.handleBillingEvent(job);
  }

  @Process('plan_changed')
  async handlePlanChanged(job: Job<BillingEventPayload>) {
    return this.handleBillingEvent(job);
  }

  @Process('cleanup_due_provisions')
  async handleCleanupDueProvisions(job: Job<{ limit?: number }>) {
    const limit = Number(job.data.limit ?? process.env.PROVISION_CLEANUP_LIMIT ?? 50);
    this.logger.log(`Processing due provision cleanup: limit=${limit}`);

    return this.provisioningService.cleanupDueProvisions(limit);
  }

  @Process('check_vpn_nodes_health')
  async handleCheckVpnNodesHealth() {
    this.logger.log('Processing VPN node health checks');

    return this.vpnNodesService.checkAllNodes();
  }

  private async handleBillingEvent(job: Job<BillingEventPayload>) {
    this.logger.log(`Processing billing event: ${job.name}`);

    try {
      await this.processedEventsService.markStatus(job.data.eventId, 'processing');
      await this.provisioningService.handleBillingEvent(job.data);
      await this.processedEventsService.markStatus(job.data.eventId, 'completed');
      return true;
    } catch (error) {
      await this.processedEventsService.markStatus(
        job.data.eventId,
        'failed',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
