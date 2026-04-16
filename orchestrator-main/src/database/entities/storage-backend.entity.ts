import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('storage_backends')
export class StorageBackendEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: true })
  name?: string | null;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ name: 'api_key', type: 'text' })
  apiKey!: string;

  @Column({ name: 'secret_key', type: 'text', nullable: true })
  secretKey?: string | null;

  @Column({ type: 'text', nullable: true })
  region?: string | null;

  @Column({ type: 'text', default: 'minio' })
  provider!: string;

  @Column({ name: 'bucket_prefix', type: 'text', nullable: true })
  bucketPrefix?: string | null;

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

