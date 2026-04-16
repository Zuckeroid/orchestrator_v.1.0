import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageBackendEntity } from '../../database/entities/storage-backend.entity';

export interface CreateStorageBackendInput {
  name?: string;
  endpoint: string;
  apiKey: string;
  secretKey?: string;
  region?: string;
  provider?: string;
  bucketPrefix?: string;
  capacity: number;
}

export interface UpdateStorageBackendInput {
  name?: string | null;
  endpoint?: string;
  apiKey?: string;
  secretKey?: string | null;
  region?: string | null;
  provider?: string;
  bucketPrefix?: string | null;
  capacity?: number;
  isActive?: boolean;
}

@Injectable()
export class StorageBackendsService {
  constructor(
    @InjectRepository(StorageBackendEntity)
    private readonly repository: Repository<StorageBackendEntity>,
  ) {}

  async list(): Promise<StorageBackendEntity[]> {
    return this.repository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findById(backendId: string): Promise<StorageBackendEntity> {
    const backend = await this.repository.findOneBy({ id: backendId });
    if (!backend) {
      throw new NotFoundException(`Storage backend not found: ${backendId}`);
    }

    return backend;
  }

  async create(input: CreateStorageBackendInput): Promise<StorageBackendEntity> {
    const backend = this.repository.create({
      name: input.name,
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      secretKey: input.secretKey,
      region: input.region,
      provider: input.provider ?? 'minio',
      bucketPrefix: input.bucketPrefix,
      capacity: input.capacity,
      currentLoad: 0,
      isActive: true,
    });

    return this.repository.save(backend);
  }

  async update(
    backendId: string,
    input: UpdateStorageBackendInput,
  ): Promise<StorageBackendEntity> {
    const backend = await this.findById(backendId);

    if (input.name !== undefined) {
      backend.name = input.name;
    }
    if (input.endpoint !== undefined) {
      backend.endpoint = input.endpoint;
    }
    if (input.apiKey !== undefined) {
      backend.apiKey = input.apiKey;
    }
    if (input.secretKey !== undefined) {
      backend.secretKey = input.secretKey;
    }
    if (input.region !== undefined) {
      backend.region = input.region;
    }
    if (input.provider !== undefined) {
      backend.provider = input.provider;
    }
    if (input.bucketPrefix !== undefined) {
      backend.bucketPrefix = input.bucketPrefix;
    }
    if (input.capacity !== undefined) {
      backend.capacity = input.capacity;
    }
    if (input.isActive !== undefined) {
      backend.isActive = input.isActive;
    }

    return this.repository.save(backend);
  }

  async disable(backendId: string): Promise<StorageBackendEntity> {
    return this.update(backendId, {
      isActive: false,
    });
  }

  async selectLeastLoaded(): Promise<StorageBackendEntity> {
    const backend = await this.repository
      .createQueryBuilder('backend')
      .where('backend.is_active = :isActive', { isActive: true })
      .andWhere('backend.current_load < backend.capacity')
      .orderBy('backend.current_load', 'ASC')
      .addOrderBy('backend.created_at', 'ASC')
      .getOne();

    if (!backend) {
      throw new Error('No active storage backend with free capacity');
    }

    return backend;
  }

  async incrementLoad(backendId: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(StorageBackendEntity)
      .set({
        currentLoad: () => 'current_load + 1',
      })
      .where('id = :backendId', { backendId })
      .andWhere('is_active = true')
      .andWhere('current_load < capacity')
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async decrementLoad(backendId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(StorageBackendEntity)
      .set({
        currentLoad: () => 'GREATEST(current_load - 1, 0)',
      })
      .where('id = :backendId', { backendId })
      .execute();
  }
}
