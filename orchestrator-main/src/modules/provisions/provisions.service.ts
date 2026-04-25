import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingEventPayload } from '../../common/types/billing-event.type';
import {
  ProvisionEntity,
  ProvisionStatus,
  StorageStatus,
} from '../../database/entities/provision.entity';
import { PaginatedResult } from '../processed-events/processed-events.service';

@Injectable()
export class ProvisionsService {
  constructor(
    @InjectRepository(ProvisionEntity)
    private readonly repository: Repository<ProvisionEntity>,
  ) {}

  async list(filters: {
    status?: string;
    externalUserId?: string;
    limit?: number;
    page?: number;
  }): Promise<PaginatedResult<ProvisionEntity>> {
    const query = this.repository
      .createQueryBuilder('provision')
      .orderBy('provision.created_at', 'DESC');

    if (filters.status) {
      query.andWhere('provision.status = :status', { status: filters.status });
    }

    if (filters.externalUserId) {
      query.andWhere('provision.external_user_id = :externalUserId', {
        externalUserId: filters.externalUserId,
      });
    }

    const normalizedLimit = Number(filters.limit);
    const normalizedPage = Number(filters.page);
    const limit = Number.isFinite(normalizedLimit)
      ? Math.max(1, Math.min(normalizedLimit, 200))
      : 50;
    const page = Number.isFinite(normalizedPage)
      ? Math.max(normalizedPage, 1)
      : 1;
    const [items, total] = await query
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getById(id: string): Promise<ProvisionEntity> {
    const provision = await this.repository.findOneBy({ id });
    if (!provision) {
      throw new NotFoundException(`Provision not found: ${id}`);
    }

    return provision;
  }

  async findAffectedByVpnNode(vpnNodeId: string): Promise<ProvisionEntity[]> {
    return this.repository.find({
      where: {
        vpnNodeId,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findDueForDeletion(limit = 50): Promise<ProvisionEntity[]> {
    return this.repository
      .createQueryBuilder('provision')
      .where('provision.status IN (:...statuses)', {
        statuses: ['cancelled', 'suspended'],
      })
      .andWhere('provision.delete_after IS NOT NULL')
      .andWhere('provision.delete_after <= :now', { now: new Date() })
      .orderBy('provision.delete_after', 'ASC')
      .take(Math.min(limit, 200))
      .getMany();
  }

  async findByExternalSubscriptionId(
    externalSubscriptionId: string,
  ): Promise<ProvisionEntity | null> {
    return this.repository.findOneBy({ externalSubscriptionId });
  }

  async getOrCreateFromEvent(
    event: BillingEventPayload,
  ): Promise<ProvisionEntity> {
    const existing = await this.findByExternalSubscriptionId(
      event.externalSubscriptionId,
    );
    if (existing) {
      return existing;
    }

    const provision = this.repository.create({
      externalUserId: event.externalUserId,
      externalSubscriptionId: event.externalSubscriptionId,
      externalOrderId: event.externalOrderId,
      lastExternalPaymentId: event.externalPaymentId,
      email: event.email,
      status: 'pending',
      storageStatus: 'none',
    });

    return this.repository.save(provision);
  }

  async markProvisioning(provision: ProvisionEntity): Promise<void> {
    await this.repository.update(
      { id: provision.id },
      {
        status: 'provisioning',
        error: null,
      },
    );
  }

  async markActive(
    provision: ProvisionEntity,
    patch: {
      planId?: string | null;
      lastExternalPaymentId?: string | null;
      vpnNodeId?: string | null;
      vpnLogin?: string | null;
      vpnPassword?: string | null;
      subscriptionLink?: string | null;
      serviceExpiresAt?: Date | null;
      storageBackendId?: string | null;
      storageBucket?: string | null;
      storageCredentialsEncrypted?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const update = {
      ...patch,
      status: 'active',
      storageStatus: patch.storageBucket ? 'active' : provision.storageStatus,
      error: null,
    };

    await this.repository.update(
      { id: provision.id },
      update as any,
    );
  }

  async updateStatus(
    provision: ProvisionEntity,
    status: ProvisionStatus,
    patch: {
      storageStatus?: StorageStatus;
      deleteAfter?: Date | null;
      error?: string | null;
      suspendedAt?: Date | null;
      deletedAt?: Date | null;
    } = {},
  ): Promise<void> {
    await this.repository.update(
      { id: provision.id },
      {
        status,
        ...patch,
      },
    );
  }

  async markFailed(provision: ProvisionEntity, error: string): Promise<void> {
    await this.updateStatus(provision, 'failed', { error });
  }

  async updatePlan(provision: ProvisionEntity, planId: string | null): Promise<void> {
    await this.repository.update(
      { id: provision.id },
      {
        planId,
        error: null,
      },
    );
  }

  async purgeDeleted(olderThanDays: number): Promise<number> {
    const normalizedDays = Number(olderThanDays);
    const retentionDays = Number.isFinite(normalizedDays)
      ? Math.max(1, Math.min(normalizedDays, 3650))
      : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(ProvisionEntity)
      .where('status = :status', { status: 'deleted' })
      .andWhere('deleted_at IS NOT NULL')
      .andWhere('deleted_at < :cutoff', { cutoff })
      .execute();

    return result.affected ?? 0;
  }
}
