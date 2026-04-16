import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VpnNodeEntity,
  VpnNodeStatus,
} from '../../database/entities/vpn-node.entity';

export interface CreateVpnNodeInput {
  name?: string;
  host: string;
  apiKey: string;
  apiVersion?: string;
  inboundId?: number;
  capacity: number;
}

export interface UpdateVpnNodeInput {
  name?: string | null;
  host?: string;
  apiKey?: string;
  apiVersion?: string | null;
  inboundId?: number | null;
  capacity?: number;
  isActive?: boolean;
  status?: VpnNodeStatus;
  lastError?: string | null;
}

@Injectable()
export class VpnNodesService {
  constructor(
    @InjectRepository(VpnNodeEntity)
    private readonly repository: Repository<VpnNodeEntity>,
  ) {}

  async list(): Promise<VpnNodeEntity[]> {
    return this.repository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findById(nodeId: string): Promise<VpnNodeEntity> {
    const node = await this.repository.findOneBy({ id: nodeId });
    if (!node) {
      throw new NotFoundException(`VPN node not found: ${nodeId}`);
    }

    return node;
  }

  async create(input: CreateVpnNodeInput): Promise<VpnNodeEntity> {
    const node = this.repository.create({
      name: input.name,
      host: input.host,
      apiKey: input.apiKey,
      apiVersion: input.apiVersion,
      inboundId: input.inboundId,
      capacity: input.capacity,
      currentLoad: 0,
      isActive: true,
      status: 'active',
      type: '3x-ui',
    });

    return this.repository.save(node);
  }

  async update(
    nodeId: string,
    input: UpdateVpnNodeInput,
  ): Promise<VpnNodeEntity> {
    const node = await this.findById(nodeId);

    if (input.name !== undefined) {
      node.name = input.name;
    }
    if (input.host !== undefined) {
      node.host = input.host;
    }
    if (input.apiKey !== undefined) {
      node.apiKey = input.apiKey;
    }
    if (input.apiVersion !== undefined) {
      node.apiVersion = input.apiVersion;
    }
    if (input.inboundId !== undefined) {
      node.inboundId = input.inboundId;
    }
    if (input.capacity !== undefined) {
      node.capacity = input.capacity;
    }
    if (input.isActive !== undefined) {
      node.isActive = input.isActive;
    }
    if (input.status !== undefined) {
      node.status = input.status;
    }
    if (input.lastError !== undefined) {
      node.lastError = input.lastError;
    }

    return this.repository.save(node);
  }

  async disable(nodeId: string): Promise<VpnNodeEntity> {
    return this.update(nodeId, {
      isActive: false,
      status: 'draining',
    });
  }

  async selectLeastLoaded(): Promise<VpnNodeEntity> {
    const node = await this.repository
      .createQueryBuilder('node')
      .where('node.is_active = :isActive', { isActive: true })
      .andWhere('node.status = :status', { status: 'active' })
      .andWhere('node.current_load < node.capacity')
      .orderBy('node.current_load', 'ASC')
      .addOrderBy('node.created_at', 'ASC')
      .getOne();

    if (!node) {
      throw new Error('No active VPN node with free capacity');
    }

    return node;
  }

  async incrementLoad(nodeId: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(VpnNodeEntity)
      .set({
        currentLoad: () => 'current_load + 1',
      })
      .where('id = :nodeId', { nodeId })
      .andWhere('is_active = true')
      .andWhere('status = :status', { status: 'active' })
      .andWhere('current_load < capacity')
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async decrementLoad(nodeId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(VpnNodeEntity)
      .set({
        currentLoad: () => 'GREATEST(current_load - 1, 0)',
      })
      .where('id = :nodeId', { nodeId })
      .execute();
  }
}
