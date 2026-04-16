export type BillingEventType =
  | 'payment_paid'
  | 'subscription_cancel'
  | 'subscription_expired'
  | 'plan_changed';

export interface BillingEventPayload {
  event: BillingEventType;
  eventId: string;
  externalUserId: string;
  externalSubscriptionId: string;
  externalOrderId?: string;
  externalPaymentId?: string;
  externalPlanId?: string;
  email: string;
  status?: string;
  rawPayload?: Record<string, unknown>;
}

