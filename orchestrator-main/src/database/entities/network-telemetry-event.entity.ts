import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type NetworkTelemetryEventType =
  | 'dns_resolution'
  | 'node_tcp_connect'
  | 'vpn_handshake'
  | 'tunnel_http'
  | 'route_probe';

export type NetworkTelemetryResult =
  | 'success'
  | 'failed'
  | 'timeout'
  | 'skipped';

export type NetworkTelemetryClassification =
  | 'dns_suspected'
  | 'ip_or_port_suspected'
  | 'protocol_suspected'
  | 'node_exit_degraded'
  | 'provider_dpi_suspected'
  | 'client_network_changed'
  | 'unknown';

@Entity('network_telemetry_events')
export class NetworkTelemetryEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'event_type', type: 'text' })
  eventType!: NetworkTelemetryEventType;

  @Index()
  @Column({ type: 'text' })
  result!: NetworkTelemetryResult;

  @Index()
  @Column({ type: 'text', nullable: true })
  classification?: NetworkTelemetryClassification | null;

  @Index()
  @Column({ name: 'node_id', type: 'uuid', nullable: true })
  nodeId?: string | null;

  @Column({ name: 'node_name', type: 'text', nullable: true })
  nodeName?: string | null;

  @Index()
  @Column({ name: 'node_country', type: 'text', nullable: true })
  nodeCountry?: string | null;

  @Column({ name: 'node_host', type: 'text', nullable: true })
  nodeHost?: string | null;

  @Column({ name: 'node_port', type: 'integer', nullable: true })
  nodePort?: number | null;

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

  @Column({ type: 'text', nullable: true })
  mcc?: string | null;

  @Column({ type: 'text', nullable: true })
  mnc?: string | null;

  @Column({ name: 'app_version', type: 'text', nullable: true })
  appVersion?: string | null;

  @Column({ type: 'text', nullable: true })
  platform?: string | null;

  @Column({ name: 'install_id_hash', type: 'text', nullable: true })
  installIdHash?: string | null;

  @Column({ name: 'device_config_id', type: 'uuid', nullable: true })
  deviceConfigId?: string | null;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs?: number | null;

  @Column({ name: 'error_code', type: 'text', nullable: true })
  errorCode?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details?: Record<string, unknown> | null;

  @Index()
  @Column({ name: 'observed_at', type: 'timestamp', default: () => 'now()' })
  observedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
