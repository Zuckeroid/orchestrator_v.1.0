import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProcessedEventEntity } from './processed-event.entity';

@Entity('jobs')
export class JobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  type!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'processed_event_id', type: 'uuid', nullable: true })
  processedEventId?: string | null;

  @ManyToOne(() => ProcessedEventEntity, { nullable: true })
  @JoinColumn({ name: 'processed_event_id' })
  processedEvent?: ProcessedEventEntity | null;

  @Column({ type: 'text' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

