import { BillingEventPayload } from '../../common/types/billing-event.type';

export interface BillingConfigSnapshot {
  ready: boolean;
  runtimeType?: string | null;
  protocol?: string | null;
  configRevision?: string | null;
  runtimePayload?: string | null;
  nodeId?: string | null;
  nodeLabel?: string | null;
  nodeCountry?: string | null;
  nodeHost?: string | null;
  sourceSubscriptionLink?: string | null;
  generatedAt?: string | null;
}

export interface BillingProvider {
  validateWebhook(payload: BillingEventPayload): Promise<void>;
  updateServiceStatus(
    externalSubscriptionId: string,
    status: string,
    error?: string | null,
  ): Promise<void>;
  updateDeviceConfig(
    externalSubscriptionId: string,
    snapshot: BillingConfigSnapshot,
  ): Promise<void>;
  syncPlans(): Promise<void>;
}
