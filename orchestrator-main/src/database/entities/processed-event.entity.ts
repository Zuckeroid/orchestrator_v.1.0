import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BillingEventType } from '../../common/types/billing-event.type';

export type ProcessedEventStatus =
  | 'received'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

@Entity('processed_events')
export class ProcessedEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'text', unique: true })
  eventId!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: BillingEventType;

  @Column({ name: 'external_user_id', type: 'text', nullable: true })
  externalUserId?: string | null;

  @Index()
  @Column({ name: 'external_subscription_id', type: 'text', nullable: true })
  externalSubscriptionId?: string | null;

  @Column({ name: 'external_order_id', type: 'text', nullable: true })
  externalOrderId?: string | null;

  @Column({ name: 'external_payment_id', type: 'text', nullable: true })
  externalPaymentId?: string | null;

  @Column({ name: 'external_plan_id', type: 'text', nullable: true })
  externalPlanId?: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Index()
  @Column({ type: 'text' })
  status!: ProcessedEventStatus;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt?: Date | null;
}

