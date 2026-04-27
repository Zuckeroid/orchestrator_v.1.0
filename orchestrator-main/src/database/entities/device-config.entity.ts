import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProvisionEntity } from './provision.entity';
import { ProviderAccessEntity } from './provider-access.entity';
import { VpnNodeEntity } from './vpn-node.entity';

export type DeviceConfigStatus =
  | 'pending'
  | 'ready'
  | 'active'
  | 'failed'
  | 'revoked'
  | 'deleted';

@Entity('device_configs')
export class DeviceConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'provision_id', type: 'uuid' })
  provisionId!: string;

  @ManyToOne(() => ProvisionEntity, (provision) => provision.deviceConfigs, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'provision_id' })
  provision!: ProvisionEntity;

  @Index()
  @Column({ name: 'device_id', type: 'text', nullable: true })
  deviceId?: string | null;

  @Column({ name: 'order_id', type: 'text', nullable: true })
  orderId?: string | null;

  @Column({ name: 'client_id', type: 'text', nullable: true })
  clientId?: string | null;

  @Column({ name: 'install_id', type: 'text', nullable: true })
  installId?: string | null;

  @Index()
  @Column({ type: 'text', default: 'pending' })
  status!: DeviceConfigStatus;

  @Column({ name: 'runtime_type', type: 'text', nullable: true })
  runtimeType?: string | null;

  @Column({ name: 'runtime_payload', type: 'text', nullable: true })
  runtimePayload?: string | null;

  @Column({ type: 'text', nullable: true })
  protocol?: string | null;

  @Index()
  @Column({ name: 'node_id', type: 'uuid', nullable: true })
  nodeId?: string | null;

  @ManyToOne(() => VpnNodeEntity, { nullable: true })
  @JoinColumn({ name: 'node_id' })
  node?: VpnNodeEntity | null;

  @Index()
  @Column({ name: 'config_revision', type: 'text', nullable: true })
  configRevision?: string | null;

  @Column({ name: 'routing_policy_json', type: 'jsonb', nullable: true })
  routingPolicyJson?: Record<string, unknown> | null;

  @Column({ name: 'automation_policy_json', type: 'jsonb', nullable: true })
  automationPolicyJson?: Record<string, unknown> | null;

  @Column({ name: 'telemetry_profile_json', type: 'jsonb', nullable: true })
  telemetryProfileJson?: Record<string, unknown> | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'generated_at', type: 'timestamp', nullable: true })
  generatedAt?: Date | null;

  @OneToMany(
    () => ProviderAccessEntity,
    (providerAccess) => providerAccess.deviceConfig,
  )
  providerAccesses?: ProviderAccessEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
