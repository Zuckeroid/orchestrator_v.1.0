import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VpnNodeEntity,
  VpnNodeHealthStatus,
  VpnNodeStatus,
} from '../../database/entities/vpn-node.entity';
import {
  VpnClient,
  VpnNodeCheckResult,
} from '../../integrations/vpn/vpn-client.interface';
import { VPN_CLIENT } from '../../integrations/vpn/vpn.module';

export interface CreateVpnNodeInput {
  name?: string;
  host: string;
  apiKey: string;
  apiVersion?: string;
  inboundId?: number;
  subscriptionBaseUrl?: string;
  capacity: number;
}

export interface UpdateVpnNodeInput {
  name?: string | null;
  host?: string;
  apiKey?: string;
  apiVersion?: string | null;
  inboundId?: number | null;
  subscriptionBaseUrl?: string | null;
  capacity?: number;
  isActive?: boolean;
  status?: VpnNodeStatus;
  lastError?: string | null;
  healthStatus?: VpnNodeHealthStatus;
  lastHealthCheckAt?: Date | null;
  lastSuccessfulHealthCheckAt?: Date | null;
  failureCount?: number;
}

@Injectable()
export class VpnNodesService {
  constructor(
    @InjectRepository(VpnNodeEntity)
    private readonly repository: Repository<VpnNodeEntity>,
    @Inject(VPN_CLIENT)
    private readonly vpnClient: VpnClient,
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
      subscriptionBaseUrl: input.subscriptionBaseUrl,
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
    if (input.subscriptionBaseUrl !== undefined) {
      node.subscriptionBaseUrl = input.subscriptionBaseUrl;
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
    if (input.healthStatus !== undefined) {
      node.healthStatus = input.healthStatus;
    }
    if (input.lastHealthCheckAt !== undefined) {
      node.lastHealthCheckAt = input.lastHealthCheckAt;
    }
    if (input.lastSuccessfulHealthCheckAt !== undefined) {
      node.lastSuccessfulHealthCheckAt = input.lastSuccessfulHealthCheckAt;
    }
    if (input.failureCount !== undefined) {
      node.failureCount = input.failureCount;
    }

    return this.repository.save(node);
  }

  async disable(nodeId: string): Promise<VpnNodeEntity> {
    return this.update(nodeId, {
      isActive: false,
      status: 'draining',
    });
  }

  async checkNode(nodeId: string): Promise<VpnNodeCheckResult> {
    const node = await this.findById(nodeId);
    const checkedAt = new Date();

    try {
      const result = await this.vpnClient.checkNode({
        id: node.id,
        host: node.host,
        apiKey: node.apiKey,
        apiVersion: node.apiVersion ?? undefined,
        inboundId: node.inboundId ?? undefined,
      });

      node.lastError = null;
      node.healthStatus = 'online';
      node.lastHealthCheckAt = checkedAt;
      node.lastSuccessfulHealthCheckAt = checkedAt;
      node.failureCount = 0;
      if (result.clientCount !== undefined) {
        node.currentLoad = result.clientCount;
      }
      await this.repository.save(node);

      return result;
    } catch (error) {
      node.lastError = error instanceof Error ? error.message : String(error);
      node.healthStatus = this.healthStatusFromError(error);
      node.lastHealthCheckAt = checkedAt;
      node.failureCount = (node.failureCount ?? 0) + 1;
      await this.repository.save(node);
      throw error;
    }
  }

  async checkAllNodes(): Promise<{
    total: number;
    online: number;
    degraded: number;
    offline: number;
    failed: string[];
  }> {
    const nodes = await this.repository.find({
      order: {
        createdAt: 'ASC',
      },
    });

    let online = 0;
    let degraded = 0;
    let offline = 0;
    const failed: string[] = [];

    for (const node of nodes) {
      try {
        await this.checkNode(node.id);
        online += 1;
      } catch (error) {
        const fresh = await this.findById(node.id);
        if (fresh.healthStatus === 'degraded') {
          degraded += 1;
        } else {
          offline += 1;
        }
        failed.push(`${node.id}: ${fresh.lastError ?? 'unknown error'}`);
      }
    }

    return {
      total: nodes.length,
      online,
      degraded,
      offline,
      failed,
    };
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

  private healthStatusFromError(error: unknown): VpnNodeHealthStatus {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error);

    if (message.includes('inbound')) {
      return 'degraded';
    }

    return 'offline';
  }
}
