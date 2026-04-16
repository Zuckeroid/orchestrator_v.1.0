import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type VpnNodeStatus = 'active' | 'inactive' | 'blocked' | 'draining';

@Entity('vpn_nodes')
export class VpnNodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: true })
  name?: string | null;

  @Column({ type: 'text' })
  host!: string;

  @Column({ name: 'api_key', type: 'text' })
  apiKey!: string;

  @Column({ name: 'api_version', type: 'text', nullable: true })
  apiVersion?: string | null;

  @Column({ name: 'inbound_id', type: 'integer', nullable: true })
  inboundId?: number | null;

  @Column({ type: 'text', default: '3x-ui' })
  type!: string;

  @Index()
  @Column({ type: 'text', default: 'active' })
  status!: VpnNodeStatus;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'integer' })
  capacity!: number;

  @Index()
  @Column({ name: 'current_load', type: 'integer', default: 0 })
  currentLoad!: number;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

