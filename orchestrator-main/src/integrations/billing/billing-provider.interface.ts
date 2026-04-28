import { BillingEventPayload } from '../../common/types/billing-event.type';

export interface BillingConfigSnapshot {
  ready: boolean;
  runtimeType?: string | null;
  protocol?: string | null;
  configRevision?: string | null;
  runtimePayload?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  platform?: string | null;
  installId?: string | null;
  nodeId?: string | null;
  nodeLabel?: string | null;
  nodeCountry?: string | null;
  nodeHost?: string | null;
  routingPolicy?: Record<string, unknown> | null;
  automationPolicy?: Record<string, unknown> | null;
  connectionProfiles?: Record<string, unknown> | null;
  telemetryProfile?: Record<string, unknown> | null;
  domainBundle?: unknown | null;
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
