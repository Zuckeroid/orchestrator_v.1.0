import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_policy_apps')
export class AppPolicyAppEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'text', default: 'android' })
  platform!: string;

  @Index()
  @Column({ type: 'text' })
  name!: string;

  @Index({ unique: true })
  @Column({ name: 'package_name', type: 'text' })
  packageName!: string;

  @Index()
  @Column({ type: 'text', nullable: true })
  category?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
