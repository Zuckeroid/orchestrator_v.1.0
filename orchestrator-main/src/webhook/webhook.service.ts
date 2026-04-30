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
import {
  CreateNetworkTelemetryEventDto,
  NETWORK_TELEMETRY_CLASSIFICATIONS,
  NETWORK_TELEMETRY_EVENT_TYPES,
  NETWORK_TELEMETRY_RESULTS,
} from '../modules/telemetry/dto/create-network-telemetry-event.dto';
import { TelemetryService } from '../modules/telemetry/telemetry.service';

@Injectable()
export class WebhookService {
  constructor(
    private queueService: QueueService,
    private configService: ConfigService,
    private processedEventsService: ProcessedEventsService,
    private telemetryService: TelemetryService,
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

  async handleTelemetry(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
    rawBody?: Buffer,
  ) {
    this.validateApiKey(headers);
    this.validateTimestamp(headers);
    this.validateSignature(headers, rawBody);

    return {
      success: true,
      data: await this.telemetryService.record(
        this.parseTelemetryPayload(body),
      ),
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
      deviceLimit: this.getOptionalNumber(body, 'deviceLimit'),
      deviceId: this.getOptionalString(body, 'deviceId'),
      deviceName: this.getOptionalString(body, 'deviceName'),
      platform: this.getOptionalString(body, 'platform'),
      installId: this.getOptionalString(body, 'installId'),
      email: this.getString(body, 'email'),
      status: this.getOptionalString(body, 'status'),
      expiresAt: this.getOptionalString(body, 'expiresAt'),
      rawPayload: body,
    };

    this.validateEvent(payload);

    return payload;
  }

  private parseTelemetryPayload(body: unknown): CreateNetworkTelemetryEventDto {
    if (!this.isRecord(body)) {
      throw new InvalidWebhookError(
        'INVALID_PAYLOAD',
        'Telemetry payload must be an object',
      );
    }

    const eventType = this.getString(body, 'eventType');
    const result = this.getString(body, 'result');
    if (!(NETWORK_TELEMETRY_EVENT_TYPES as readonly string[]).includes(eventType)) {
      throw new InvalidWebhookError(
        'INVALID_PAYLOAD',
        `Unsupported telemetry event type: ${eventType}`,
      );
    }
    if (!(NETWORK_TELEMETRY_RESULTS as readonly string[]).includes(result)) {
      throw new InvalidWebhookError(
        'INVALID_PAYLOAD',
        `Unsupported telemetry result: ${result}`,
      );
    }

    const classification = this.getOptionalString(body, 'classification');
    if (
      classification &&
      !(NETWORK_TELEMETRY_CLASSIFICATIONS as readonly string[]).includes(
        classification,
      )
    ) {
      throw new InvalidWebhookError(
        'INVALID_PAYLOAD',
        `Unsupported telemetry classification: ${classification}`,
      );
    }

    return {
      eventType: eventType as CreateNetworkTelemetryEventDto['eventType'],
      result: result as CreateNetworkTelemetryEventDto['result'],
      classification:
        classification as CreateNetworkTelemetryEventDto['classification'],
      nodeId: this.getOptionalString(body, 'nodeId'),
      nodeName: this.getOptionalString(body, 'nodeName'),
      nodeCountry: this.getOptionalString(body, 'nodeCountry'),
      nodeHost: this.getOptionalString(body, 'nodeHost'),
      nodePort: this.getOptionalInteger(body, 'nodePort'),
      protocol: this.getOptionalString(body, 'protocol'),
      transport: this.getOptionalString(body, 'transport'),
      networkType: this.getOptionalString(body, 'networkType'),
      carrierName: this.getOptionalString(body, 'carrierName'),
      mcc: this.getOptionalString(body, 'mcc'),
      mnc: this.getOptionalString(body, 'mnc'),
      appVersion: this.getOptionalString(body, 'appVersion'),
      platform: this.getOptionalString(body, 'platform'),
      installIdHash: this.getOptionalString(body, 'installIdHash'),
      deviceConfigId: this.getOptionalString(body, 'deviceConfigId'),
      latencyMs: this.getOptionalInteger(body, 'latencyMs'),
      errorCode: this.getOptionalString(body, 'errorCode'),
      errorMessage: this.getOptionalString(body, 'errorMessage'),
      details: this.getOptionalObject(body, 'details'),
      observedAt: this.getOptionalString(body, 'observedAt'),
    };
  }

  private validateEvent(payload: BillingEventPayload): void {
    const supportedEvents: BillingEventType[] = [
      'payment_paid',
      'subscription_cancel',
      'subscription_expired',
      'plan_changed',
      'subscription_delete',
      'device_activated',
      'device_revoked',
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
      this.requireNumberField(payload.deviceLimit, 'deviceLimit');
    }

    if (payload.event === 'plan_changed') {
      this.requireField(payload.externalPlanId, 'externalPlanId');
      this.requireNumberField(payload.deviceLimit, 'deviceLimit');
    }

    if (payload.event === 'device_activated' || payload.event === 'device_revoked') {
      this.requireField(payload.deviceId, 'deviceId');
      this.requireField(payload.installId, 'installId');
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

    if (
      payload.deviceLimit !== undefined &&
      (!Number.isInteger(payload.deviceLimit) || payload.deviceLimit < 0)
    ) {
      throw new InvalidWebhookError(
        'INVALID_PAYLOAD',
        'deviceLimit must be a non-negative integer',
      );
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

  private getOptionalNumber(
    body: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = body[key];
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    throw new InvalidWebhookError('INVALID_PAYLOAD', `${key} must be a number`);
  }

  private getOptionalInteger(
    body: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = this.getOptionalNumber(body, key);
    if (value === undefined) {
      return undefined;
    }

    if (!Number.isInteger(value)) {
      throw new InvalidWebhookError('INVALID_PAYLOAD', `${key} must be an integer`);
    }

    return value;
  }

  private getOptionalObject(
    body: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> | undefined {
    const value = body[key];
    if (value === undefined || value === null) {
      return undefined;
    }

    if (!this.isRecord(value)) {
      throw new InvalidWebhookError('INVALID_PAYLOAD', `${key} must be an object`);
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

  private requireNumberField(value: number | undefined, key: string): void {
    if (value === undefined) {
      throw new InvalidWebhookError('INVALID_PAYLOAD', `${key} is required`);
    }
  }
}
