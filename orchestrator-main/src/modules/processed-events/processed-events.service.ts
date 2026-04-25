import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { BillingEventPayload } from '../../common/types/billing-event.type';
import {
  ProcessedEventEntity,
  ProcessedEventStatus,
} from '../../database/entities/processed-event.entity';

export interface ProcessedEventClaimResult {
  duplicate: boolean;
  event: ProcessedEventEntity;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ProcessedEventsService {
  constructor(
    @InjectRepository(ProcessedEventEntity)
    private readonly repository: Repository<ProcessedEventEntity>,
  ) {}

  async list(filters: {
    status?: string;
    externalSubscriptionId?: string;
    eventId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<ProcessedEventEntity>> {
    const query = this.repository
      .createQueryBuilder('event')
      .orderBy('event.received_at', 'DESC');

    if (filters.status) {
      query.andWhere('event.status = :status', { status: filters.status });
    }

    if (filters.externalSubscriptionId) {
      query.andWhere(
        'event.external_subscription_id = :externalSubscriptionId',
        {
          externalSubscriptionId: filters.externalSubscriptionId,
        },
      );
    }

    if (filters.eventId) {
      query.andWhere('event.event_id = :eventId', { eventId: filters.eventId });
    }

    const normalizedLimit = Number(filters.limit);
    const normalizedPage = Number(filters.page);
    const limit = Number.isFinite(normalizedLimit)
      ? Math.max(1, Math.min(normalizedLimit, 200))
      : 50;
    const page = Number.isFinite(normalizedPage)
      ? Math.max(normalizedPage, 1)
      : 1;
    const [items, total] = await query
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getById(id: string): Promise<ProcessedEventEntity> {
    const event = await this.repository.findOneBy({ id });
    if (!event) {
      throw new NotFoundException(`Processed event not found: ${id}`);
    }

    return event;
  }

  async getByEventId(eventId: string): Promise<ProcessedEventEntity> {
    const event = await this.repository.findOneBy({ eventId });
    if (!event) {
      throw new NotFoundException(`Processed event not found: ${eventId}`);
    }

    return event;
  }

  async buildRetryPayload(id: string): Promise<BillingEventPayload> {
    const event = await this.getById(id);
    if (event.status !== 'failed') {
      throw new BadRequestException(
        `Only failed events can be retried manually (current status: ${event.status})`,
      );
    }

    const email = this.readOptionalString(event.payload, 'email');
    if (!email) {
      throw new BadRequestException(
        `Processed event ${event.eventId} does not contain an email required for retry`,
      );
    }

    return {
      event: event.eventType,
      eventId: event.eventId,
      externalUserId: event.externalUserId ?? this.readRequiredString(event.payload, 'externalUserId'),
      externalSubscriptionId:
        event.externalSubscriptionId ??
        this.readRequiredString(event.payload, 'externalSubscriptionId'),
      externalOrderId:
        event.externalOrderId ?? this.readOptionalString(event.payload, 'externalOrderId'),
      externalPaymentId:
        event.externalPaymentId ??
        this.readOptionalString(event.payload, 'externalPaymentId'),
      externalPlanId:
        event.externalPlanId ?? this.readOptionalString(event.payload, 'externalPlanId'),
      email,
      status: this.readOptionalString(event.payload, 'status'),
      expiresAt: this.readOptionalString(event.payload, 'expiresAt'),
      rawPayload: event.payload,
    };
  }

  async claim(payload: BillingEventPayload): Promise<ProcessedEventClaimResult> {
    const entity = new ProcessedEventEntity();
    entity.eventId = payload.eventId;
    entity.eventType = payload.event;
    entity.externalUserId = payload.externalUserId;
    entity.externalSubscriptionId = payload.externalSubscriptionId;
    entity.externalOrderId = payload.externalOrderId;
    entity.externalPaymentId = payload.externalPaymentId;
    entity.externalPlanId = payload.externalPlanId;
    entity.payload = payload.rawPayload ?? this.serializePayload(payload);
    entity.status = 'received';

    try {
      const saved = await this.repository.save(entity);
      return {
        duplicate: false,
        event: saved,
      };
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.repository.findOneByOrFail({
        eventId: payload.eventId,
      });

      return {
        duplicate: true,
        event: existing,
      };
    }
  }

  async markStatus(
    eventId: string,
    status: ProcessedEventStatus,
    error?: string,
  ): Promise<void> {
    await this.repository.update(
      { eventId },
      {
        status,
        error: error ?? null,
        processedAt:
          status === 'completed' || status === 'failed' ? new Date() : null,
      },
    );
  }

  async purge(filters: {
    status?: 'completed' | 'failed' | 'all-terminal';
    olderThanDays: number;
  }): Promise<number> {
    const normalizedDays = Number(filters.olderThanDays);
    const olderThanDays = Number.isFinite(normalizedDays)
      ? Math.max(1, Math.min(normalizedDays, 3650))
      : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const statuses =
      filters.status === 'failed'
        ? (['failed'] as const)
        : filters.status === 'all-terminal'
          ? (['completed', 'failed'] as const)
          : (['completed'] as const);

    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(ProcessedEventEntity)
      .where('status IN (:...statuses)', { statuses })
      .andWhere('received_at < :cutoff', { cutoff })
      .execute();

    return result.affected ?? 0;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    );
  }

  private serializePayload(payload: BillingEventPayload): Record<string, unknown> {
    return {
      event: payload.event,
      eventId: payload.eventId,
      externalUserId: payload.externalUserId,
      externalSubscriptionId: payload.externalSubscriptionId,
      externalOrderId: payload.externalOrderId,
      externalPaymentId: payload.externalPaymentId,
      externalPlanId: payload.externalPlanId,
      email: payload.email,
      status: payload.status,
    };
  }

  private readRequiredString(
    payload: Record<string, unknown>,
    key: string,
  ): string {
    const value = payload[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(
        `Processed event payload does not contain a valid ${key}`,
      );
    }

    return value;
  }

  private readOptionalString(
    payload: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = payload[key];
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
