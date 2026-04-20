import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanEntity } from '../../database/entities/plan.entity';
import { ProvisionEntity } from '../../database/entities/provision.entity';

export interface CreatePlanInput {
  externalPlanId: string;
  billingProvider?: string;
  name: string;
  vpnEnabled?: boolean;
  storageEnabled?: boolean;
  maxDevices?: number | null;
  storageSize?: number | string | null;
}

export interface UpdatePlanInput {
  billingProvider?: string | null;
  name?: string;
  vpnEnabled?: boolean;
  storageEnabled?: boolean;
  maxDevices?: number | null;
  storageSize?: number | string | null;
}

export interface ResolvedPlan {
  entity?: PlanEntity;
  planId: string | null;
  maxDevices: number;
  storageSizeBytes: number;
  vpnEnabled: boolean;
  storageEnabled: boolean;
}

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly repository: Repository<PlanEntity>,
    @InjectRepository(ProvisionEntity)
    private readonly provisionsRepository: Repository<ProvisionEntity>,
  ) {}

  async list(): Promise<PlanEntity[]> {
    return this.repository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getById(id: string): Promise<PlanEntity> {
    const plan = await this.repository.findOneBy({ id });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${id}`);
    }

    return plan;
  }

  async create(input: CreatePlanInput): Promise<PlanEntity> {
    const plan = this.repository.create({
      externalPlanId: input.externalPlanId,
      billingProvider: input.billingProvider,
      name: input.name,
      vpnEnabled: input.vpnEnabled ?? true,
      storageEnabled: input.storageEnabled ?? true,
      maxDevices: input.maxDevices ?? null,
      storageSize:
        input.storageSize === undefined || input.storageSize === null
          ? null
          : String(input.storageSize),
    });

    return this.repository.save(plan);
  }

  async update(id: string, input: UpdatePlanInput): Promise<PlanEntity> {
    const plan = await this.getById(id);

    if (input.billingProvider !== undefined) {
      plan.billingProvider = input.billingProvider;
    }
    if (input.name !== undefined) {
      plan.name = input.name;
    }
    if (input.vpnEnabled !== undefined) {
      plan.vpnEnabled = input.vpnEnabled;
    }
    if (input.storageEnabled !== undefined) {
      plan.storageEnabled = input.storageEnabled;
    }
    if (input.maxDevices !== undefined) {
      plan.maxDevices = input.maxDevices;
    }
    if (input.storageSize !== undefined) {
      plan.storageSize =
        input.storageSize === null ? null : String(input.storageSize);
    }

    return this.repository.save(plan);
  }

  async delete(id: string): Promise<void> {
    const plan = await this.getById(id);
    const blockingProvisionsCount = await this.provisionsRepository
      .createQueryBuilder('provision')
      .where('provision.plan_id = :planId', { planId: plan.id })
      .andWhere('provision.status != :deletedStatus', { deletedStatus: 'deleted' })
      .getCount();

    if (blockingProvisionsCount > 0) {
      throw new ConflictException(
        `Plan mapping is used by ${blockingProvisionsCount} non-deleted provision(s) and cannot be deleted`,
      );
    }

    await this.repository.remove(plan);
  }

  async resolveByExternalPlanId(
    externalPlanId: string | undefined,
  ): Promise<ResolvedPlan> {
    if (!externalPlanId) {
      throw new NotFoundException('Billing plan ID is required');
    }

    const plan = await this.repository.findOneBy({ externalPlanId });
    if (!plan) {
      throw new NotFoundException(
        `Plan mapping not found for billing plan: ${externalPlanId}`,
      );
    }

    return {
      entity: plan,
      planId: plan.id,
      maxDevices: plan.maxDevices ?? 0,
      storageSizeBytes: Number(plan.storageSize ?? 0),
      vpnEnabled: plan.vpnEnabled,
      storageEnabled: plan.storageEnabled,
    };
  }
}
