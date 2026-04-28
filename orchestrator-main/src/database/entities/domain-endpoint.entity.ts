import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DomainEndpointPurpose = 'api' | 'web';
export type DomainEndpointRole = 'primary' | 'backup';

@Entity('domain_endpoints')
@Index(['purpose', 'url'], { unique: true })
export class DomainEndpointEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'text', default: 'api' })
  purpose!: DomainEndpointPurpose;

  @Index()
  @Column({ type: 'text', default: 'backup' })
  role!: DomainEndpointRole;

  @Column({ type: 'text', nullable: true })
  label?: string | null;

  @Column({ type: 'text' })
  url!: string;

  @Index()
  @Column({ type: 'int', default: 100 })
  priority!: number;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
