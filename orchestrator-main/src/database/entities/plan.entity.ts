import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plans')
export class PlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'external_plan_id', type: 'text', unique: true })
  externalPlanId!: string;

  @Column({ name: 'billing_provider', type: 'text', nullable: true })
  billingProvider?: string | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'vpn_enabled', type: 'boolean', default: true })
  vpnEnabled!: boolean;

  @Column({ name: 'storage_enabled', type: 'boolean', default: true })
  storageEnabled!: boolean;

  @Column({ name: 'max_devices', type: 'integer', nullable: true })
  maxDevices?: number | null;

  @Column({ name: 'storage_size', type: 'bigint', nullable: true })
  storageSize?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

