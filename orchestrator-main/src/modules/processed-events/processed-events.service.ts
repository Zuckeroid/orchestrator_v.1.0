import { Injectable, NotFoundException } from '@nestjs/common';
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
  }): Promise<ProcessedEventEntity[]> {
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

    const limit = Math.min(filters.limit ?? 50, 200);
    const page = Math.max(filters.page ?? 1, 1);

    return query
      .take(limit)
      .skip((page - 1) * limit)
      .getMany();
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
}
