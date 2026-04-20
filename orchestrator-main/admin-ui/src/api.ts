export interface ApiSettings {
  apiBaseUrl: string;
  adminApiKey: string;
  adminActor: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiClient {
  constructor(private readonly settings: ApiSettings) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async postBillingWebhook(
    payload: BillingWebhookPayload,
  ): Promise<BillingWebhookResponse> {
    return this.request<BillingWebhookResponse>('/webhook/billing/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.settings.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.settings.adminApiKey
          ? { 'X-Admin-Api-Key': this.settings.adminApiKey }
          : {}),
        'X-Admin-Actor': this.settings.adminActor,
        'X-Request-Id': createRequestId(),
        ...(init.headers ?? {}),
      },
    });

    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || envelope.success === false) {
      throw new Error(
        envelope.error?.message ?? `Request failed with HTTP ${response.status}`,
      );
    }

    return envelope.data as T;
  }
}

function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export interface HealthData {
  status: string;
  db: string;
  redis: string;
  queue: {
    status: string;
    counts: QueueCounts;
  };
}

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface QueueOverview {
  counts: QueueCounts;
  waiting: QueueJob[];
  active: QueueJob[];
  failed: QueueJob[];
  completed: QueueJob[];
  delayed: QueueJob[];
}

export interface QueueJob {
  id: string;
  name: string;
  attemptsMade: number;
  failedReason?: string;
  timestamp: number;
}

export interface Plan {
  id: string;
  externalPlanId: string;
  billingProvider?: string | null;
  name: string;
  maxDevices: number | null;
  storageSize: string | null;
  vpnEnabled: boolean;
  storageEnabled: boolean;
}

export interface VpnNode {
  id: string;
  name?: string | null;
  host: string;
  apiKey: string;
  apiVersion?: string | null;
  inboundId?: number | null;
  subscriptionBaseUrl?: string | null;
  status: string;
  healthStatus: string;
  lastError?: string | null;
  lastHealthCheckAt?: string | null;
  lastSuccessfulHealthCheckAt?: string | null;
  failureCount: number;
  capacity: number;
  currentLoad: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VpnNodeCheckResult {
  ok: boolean;
  provider: string;
  inboundId?: number | null;
  inboundFound?: boolean;
  clientCount?: number;
  message: string;
}

export interface StorageBackend {
  id: string;
  name?: string | null;
  endpoint: string;
  apiKey: string;
  secretKey?: string | null;
  region?: string | null;
  provider: string;
  bucketPrefix?: string | null;
  capacity: number;
  currentLoad: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Provision {
  id: string;
  externalUserId: string;
  externalSubscriptionId: string;
  email: string;
  status: string;
  storageStatus: string;
  vpnNodeId?: string | null;
  vpnLogin?: string | null;
  subscriptionLink?: string | null;
  serviceExpiresAt?: string | null;
  deleteAfter?: string | null;
  deletedAt?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessedEvent {
  id: string;
  eventId: string;
  eventType: string;
  externalSubscriptionId?: string | null;
  status: string;
  error?: string | null;
  receivedAt: string;
  processedAt?: string | null;
}

export interface AuditLog {
  id: string;
  actor?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  createdAt: string;
}

export type BillingWebhookEvent =
  | 'payment_paid'
  | 'subscription_cancel'
  | 'subscription_expired'
  | 'plan_changed';

export interface BillingWebhookPayload {
  event: BillingWebhookEvent;
  eventId: string;
  externalUserId: string;
  externalSubscriptionId: string;
  externalOrderId?: string;
  externalPaymentId?: string;
  externalPlanId?: string;
  email: string;
  status?: string;
  expiresAt?: string;
}

export interface BillingWebhookResponse {
  queued: boolean;
  duplicate?: boolean;
}
