import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { QueueService } from '../queue/queue.service';
import {
  BillingEventPayload,
  BillingEventType,
} from '../common/types/billing-event.type';
import { InvalidWebhookError } from '../common/errors/invalid-webhook.error';
import { ProcessedEventsService } from '../modules/processed-events/processed-events.service';

@Injectable()
export class WebhookService {
  constructor(
    private queueService: QueueService,
    private configService: ConfigService,
    private processedEventsService: ProcessedEventsService,
  ) {}

  async handle(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
    rawBody?: Buffer,
  ) {
    const payload = this.parsePayload(body);
    this.validateApiKey(headers);
    this.validateTimestamp(headers);
    this.validateSignature(headers, rawBody);

    return this.enqueuePayload(payload);
  }

  async handleTrusted(body: unknown) {
    const payload = this.parsePayload(body);

    return this.enqueuePayload(payload);
  }

  handlePreflight(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
    rawBody?: Buffer,
  ) {
    this.validateApiKey(headers);
    this.validateTimestamp(headers);
    this.validateSignature(headers, rawBody);

    return {
      success: true,
      data: {
        status: 'ok',
        acceptedAt: new Date().toISOString(),
        probe:
          this.isRecord(body) && typeof body.probe === 'string'
            ? body.probe
            : 'unknown',
      },
    };
  }

  private async enqueuePayload(payload: BillingEventPayload) {
    const claim = await this.processedEventsService.claim(payload);
    if (claim.duplicate) {
      return {
        success: true,
        data: {
          queued: false,
          duplicate: true,
        },
      };
    }

    await this.queueService.addBillingEventJob(payload);
    await this.processedEventsService.markStatus(payload.eventId, 'queued');

    return {
      success: true,
      data: {
        queued: true,
      },
    };
  }

  private parsePayload(body: unknown): BillingEventPayload {
    if (!this.isRecord(body)) {
      throw new InvalidWebhookError(
        'INVALID_PAYLOAD',
        'Webhook payload must be an object',
      );
    }

    const event = this.getString(body, 'event') as BillingEventType;
    const payload: BillingEventPayload = {
      event,
      eventId: this.getString(body, 'eventId'),
      externalUserId: this.getString(body, 'externalUserId'),
      externalSubscriptionId: this.getString(body, 'externalSubscriptionId'),
      externalOrderId: this.getOptionalString(body, 'externalOrderId'),
      externalPaymentId: this.getOptionalString(body, 'externalPaymentId'),
      externalPlanId: this.getOptionalString(body, 'externalPlanId'),
      email: this.getString(body, 'email'),
      status: this.getOptionalString(body, 'status'),
      expiresAt: this.getOptionalString(body, 'expiresAt'),
      rawPayload: body,
    };

    this.validateEvent(payload);

    return payload;
  }

  private validateEvent(payload: BillingEventPayload): void {
    const supportedEvents: BillingEventType[] = [
      'payment_paid',
      'subscription_cancel',
      'subscription_expired',
      'plan_changed',
    ];

    if (!supportedEvents.includes(payload.event)) {
      throw new InvalidWebhookError(
        'INVALID_PAYLOAD',
        `Unsupported event: ${payload.event}`,
      );
    }

    if (payload.event === 'payment_paid') {
      this.requireField(payload.externalPaymentId, 'externalPaymentId');
      this.requireField(payload.externalPlanId, 'externalPlanId');
    }

    if (payload.event === 'plan_changed') {
      this.requireField(payload.externalPlanId, 'externalPlanId');
    }

    if (payload.expiresAt) {
      const timestamp = Date.parse(payload.expiresAt);
      if (!Number.isFinite(timestamp)) {
        throw new InvalidWebhookError(
          'INVALID_PAYLOAD',
          'expiresAt must be an ISO date string',
        );
      }
    }
  }

  private validateApiKey(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const expected = this.configService.get<string>('WEBHOOK_API_KEY');
    if (!expected) {
      throw new InvalidWebhookError(
        'INTERNAL_ERROR',
        'WEBHOOK_API_KEY is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const actual = this.getHeader(headers, 'x-api-key');
    if (actual !== expected) {
      throw new InvalidWebhookError(
        'INVALID_API_KEY',
        'Invalid API key',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private validateTimestamp(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const timestamp = Number(this.getHeader(headers, 'x-timestamp'));
    if (!Number.isFinite(timestamp)) {
      throw new InvalidWebhookError(
        'INVALID_SIGNATURE',
        'Invalid webhook timestamp',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const toleranceSeconds =
      Number(this.configService.get<string>('WEBHOOK_SIGNATURE_TOLERANCE_SECONDS')) ||
      300;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      throw new InvalidWebhookError(
        'INVALID_SIGNATURE',
        'Webhook timestamp is outside tolerance',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private validateSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody?: Buffer,
  ): void {
    const secret = this.configService.get<string>('WEBHOOK_SIGNING_SECRET');
    if (!secret) {
      throw new InvalidWebhookError(
        'INTERNAL_ERROR',
        'WEBHOOK_SIGNING_SECRET is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!rawBody) {
      throw new InvalidWebhookError(
        'INVALID_SIGNATURE',
        'Raw body is required for signature check',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const receivedSignature = this.getHeader(headers, 'x-signature');
    const expectedSignature = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const received = Buffer.from(receivedSignature, 'hex');
    const expected = Buffer.from(expectedSignature, 'hex');

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new InvalidWebhookError(
        'INVALID_SIGNATURE',
        'Invalid webhook signature',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private getHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }

    return value ?? '';
  }

  private getString(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new InvalidWebhookError('INVALID_PAYLOAD', `${key} is required`);
    }

    return value;
  }

  private getOptionalString(
    body: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = body[key];
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new InvalidWebhookError('INVALID_PAYLOAD', `${key} must be a string`);
    }

    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private requireField(value: string | undefined, key: string): void {
    if (!value) {
      throw new InvalidWebhookError('INVALID_PAYLOAD', `${key} is required`);
    }
  }
}
