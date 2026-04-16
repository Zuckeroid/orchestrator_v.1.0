import { BillingEventPayload } from '../../common/types/billing-event.type';

export interface BillingProvider {
  validateWebhook(payload: BillingEventPayload): Promise<void>;
  updateServiceStatus(
    externalSubscriptionId: string,
    status: string,
  ): Promise<void>;
  updateSubscriptionLink(
    externalSubscriptionId: string,
    subscriptionLink: string,
  ): Promise<void>;
  syncPlans(): Promise<void>;
}

