import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VpnNodeEntity } from './vpn-node.entity';

export type TransportProfileProtocol = 'vless' | 'vmess' | 'trojan';
export type TransportProfileTransport = 'tcp' | 'ws' | 'grpc' | 'h2' | 'http';
export type TransportProfileSecurity = 'none' | 'tls' | 'reality';
export type TransportProfileStatus =
  | 'draft'
  | 'active'
  | 'degraded'
  | 'blocked'
  | 'disabled';

@Entity('transport_profiles')
export class TransportProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'node_id', type: 'uuid' })
  nodeId!: string;

  @ManyToOne(() => VpnNodeEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'node_id' })
  node!: VpnNodeEntity;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '3x-ui' })
  provider!: string;

  @Index()
  @Column({ name: 'provider_inbound_id', type: 'integer', nullable: true })
  providerInboundId?: number | null;

  @Index()
  @Column({ type: 'text' })
  protocol!: TransportProfileProtocol;

  @Index()
  @Column({ type: 'text' })
  transport!: TransportProfileTransport;

  @Index()
  @Column({ type: 'text' })
  security!: TransportProfileSecurity;

  @Index()
  @Column({ type: 'integer' })
  port!: number;

  @Column({ type: 'text', nullable: true })
  sni?: string | null;

  @Column({ name: 'host_header', type: 'text', nullable: true })
  hostHeader?: string | null;

  @Column({ type: 'text', nullable: true })
  path?: string | null;

  @Column({ name: 'service_name', type: 'text', nullable: true })
  serviceName?: string | null;

  @Column({ type: 'text', nullable: true })
  alpn?: string | null;

  @Column({ type: 'text', nullable: true })
  fingerprint?: string | null;

  @Column({ type: 'text', nullable: true })
  flow?: string | null;

  @Column({ name: 'public_key', type: 'text', nullable: true })
  publicKey?: string | null;

  @Column({ name: 'short_id', type: 'text', nullable: true })
  shortId?: string | null;

  @Column({ name: 'spider_x', type: 'text', nullable: true })
  spiderX?: string | null;

  @Index()
  @Column({ type: 'integer', default: 100 })
  priority!: number;

  @Column({ type: 'integer', default: 100 })
  weight!: number;

  @Index()
  @Column({ type: 'text', default: 'draft' })
  status!: TransportProfileStatus;

  @Column({ name: 'last_check_at', type: 'timestamp', nullable: true })
  lastCheckAt?: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true })
  metadataJson?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

