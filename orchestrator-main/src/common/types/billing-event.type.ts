export type BillingEventType =
  | 'payment_paid'
  | 'subscription_cancel'
  | 'subscription_expired'
  | 'plan_changed'
  | 'subscription_delete'
  | 'device_activated'
  | 'device_revoked';

export interface BillingEventPayload {
  event: BillingEventType;
  eventId: string;
  externalUserId: string;
  externalSubscriptionId: string;
  externalOrderId?: string;
  externalPaymentId?: string;
  externalPlanId?: string;
  deviceLimit?: number;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  installId?: string;
  email: string;
  status?: string;
  expiresAt?: string;
  rawPayload?: Record<string, unknown>;
}
