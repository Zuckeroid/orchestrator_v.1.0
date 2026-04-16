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
import { PlanEntity } from './plan.entity';
import { StorageBackendEntity } from './storage-backend.entity';
import { VpnNodeEntity } from './vpn-node.entity';

export type ProvisionStatus =
  | 'pending'
  | 'provisioning'
  | 'active'
  | 'failed'
  | 'suspended'
  | 'cancelled'
  | 'deleted';

export type StorageStatus = 'none' | 'active' | 'frozen' | 'deleted';

@Entity('provisions')
export class ProvisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'external_user_id', type: 'text' })
  externalUserId!: string;

  @Column({ name: 'external_subscription_id', type: 'text', unique: true })
  externalSubscriptionId!: string;

  @Column({ name: 'external_order_id', type: 'text', nullable: true })
  externalOrderId?: string | null;

  @Column({ name: 'last_external_payment_id', type: 'text', nullable: true })
  lastExternalPaymentId?: string | null;

  @Column({ type: 'text' })
  email!: string;

  @Column({ name: 'plan_id', type: 'uuid', nullable: true })
  planId?: string | null;

  @ManyToOne(() => PlanEntity, { nullable: true })
  @JoinColumn({ name: 'plan_id' })
  plan?: PlanEntity | null;

  @Index()
  @Column({ name: 'vpn_node_id', type: 'uuid', nullable: true })
  vpnNodeId?: string | null;

  @ManyToOne(() => VpnNodeEntity, { nullable: true })
  @JoinColumn({ name: 'vpn_node_id' })
  vpnNode?: VpnNodeEntity | null;

  @Index()
  @Column({ name: 'storage_backend_id', type: 'uuid', nullable: true })
  storageBackendId?: string | null;

  @ManyToOne(() => StorageBackendEntity, { nullable: true })
  @JoinColumn({ name: 'storage_backend_id' })
  storageBackend?: StorageBackendEntity | null;

  @Column({ name: 'vpn_login', type: 'text', nullable: true })
  vpnLogin?: string | null;

  @Column({ name: 'vpn_password', type: 'text', nullable: true })
  vpnPassword?: string | null;

  @Column({ name: 'subscription_link', type: 'text', nullable: true })
  subscriptionLink?: string | null;

  @Column({ name: 'storage_bucket', type: 'text', nullable: true })
  storageBucket?: string | null;

  @Column({
    name: 'storage_credentials_encrypted',
    type: 'jsonb',
    nullable: true,
  })
  storageCredentialsEncrypted?: Record<string, unknown> | null;

  @Column({ name: 'storage_status', type: 'text', default: 'none' })
  storageStatus!: StorageStatus;

  @Column({ name: 'delete_after', type: 'timestamp', nullable: true })
  deleteAfter?: Date | null;

  @Index()
  @Column({ type: 'text' })
  status!: ProvisionStatus;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ name: 'suspended_at', type: 'timestamp', nullable: true })
  suspendedAt?: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

