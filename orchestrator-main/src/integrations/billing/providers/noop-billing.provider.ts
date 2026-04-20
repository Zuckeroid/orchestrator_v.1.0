import { Injectable, Logger } from '@nestjs/common';
import { BillingProvider } from '../billing-provider.interface';
import { BillingEventPayload } from '../../../common/types/billing-event.type';

@Injectable()
export class NoopBillingProvider implements BillingProvider {
  private readonly logger = new Logger(NoopBillingProvider.name);

  async validateWebhook(payload: BillingEventPayload): Promise<void> {
    this.logger.debug(`Billing webhook accepted: ${payload.eventId}`);
  }

  async updateServiceStatus(
    externalSubscriptionId: string,
    status: string,
    error?: string | null,
  ): Promise<void> {
    this.logger.log(
      `Billing status update: ${externalSubscriptionId} -> ${status}${error ? ` (${error})` : ''}`,
    );
  }

  async updateSubscriptionLink(
    externalSubscriptionId: string,
    subscriptionLink: string,
  ): Promise<void> {
    this.logger.log(
      `Billing subscription link update: ${externalSubscriptionId} -> ${subscriptionLink}`,
    );
  }

  async syncPlans(): Promise<void> {
    this.logger.log('Billing plan sync skipped by noop provider');
  }
}
