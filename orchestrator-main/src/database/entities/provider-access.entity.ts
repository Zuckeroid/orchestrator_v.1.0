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
import { DeviceConfigEntity } from './device-config.entity';

export type ProviderAccessStatus =
  | 'pending'
  | 'active'
  | 'failed'
  | 'revoked'
  | 'deleted';

@Entity('provider_accesses')
export class ProviderAccessEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'device_config_id', type: 'uuid' })
  deviceConfigId!: string;

  @ManyToOne(
    () => DeviceConfigEntity,
    (deviceConfig) => deviceConfig.providerAccesses,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'device_config_id' })
  deviceConfig!: DeviceConfigEntity;

  @Index()
  @Column({ type: 'text' })
  provider!: string;

  @Column({ name: 'provider_user_id', type: 'text', nullable: true })
  providerUserId?: string | null;

  @Column({ name: 'provider_login', type: 'text', nullable: true })
  providerLogin?: string | null;

  @Column({ name: 'provider_metadata_json', type: 'jsonb', nullable: true })
  providerMetadataJson?: Record<string, unknown> | null;

  @Index()
  @Column({ type: 'text', default: 'pending' })
  status!: ProviderAccessStatus;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
