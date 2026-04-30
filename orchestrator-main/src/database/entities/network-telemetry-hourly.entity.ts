import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  NetworkTelemetryClassification,
  NetworkTelemetryEventType,
} from './network-telemetry-event.entity';

@Entity('network_telemetry_hourly')
export class NetworkTelemetryHourlyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'bucket_start', type: 'timestamp' })
  bucketStart!: Date;

  @Index()
  @Column({ name: 'event_type', type: 'text' })
  eventType!: NetworkTelemetryEventType;

  @Index()
  @Column({ name: 'node_id', type: 'uuid', nullable: true })
  nodeId?: string | null;

  @Column({ name: 'node_name', type: 'text', nullable: true })
  nodeName?: string | null;

  @Index()
  @Column({ name: 'node_country', type: 'text', nullable: true })
  nodeCountry?: string | null;

  @Column({ type: 'text', nullable: true })
  protocol?: string | null;

  @Column({ type: 'text', nullable: true })
  transport?: string | null;

  @Index()
  @Column({ name: 'network_type', type: 'text', nullable: true })
  networkType?: string | null;

  @Index()
  @Column({ name: 'carrier_name', type: 'text', nullable: true })
  carrierName?: string | null;

  @Index()
  @Column({ type: 'text', nullable: true })
  classification?: NetworkTelemetryClassification | null;

  @Column({ type: 'integer', default: 0 })
  total!: number;

  @Column({ type: 'integer', default: 0 })
  success!: number;

  @Column({ type: 'integer', default: 0 })
  failed!: number;

  @Column({ type: 'integer', default: 0 })
  timeout!: number;

  @Column({ type: 'integer', default: 0 })
  skipped!: number;

  @Column({ name: 'avg_latency_ms', type: 'integer', nullable: true })
  avgLatencyMs?: number | null;

  @Column({ name: 'last_observed_at', type: 'timestamp', nullable: true })
  lastObservedAt?: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
