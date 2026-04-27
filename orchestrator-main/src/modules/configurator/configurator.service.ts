import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceConfigEntity } from '../../database/entities/device-config.entity';
import { PolicyTemplateEntity } from '../../database/entities/policy-template.entity';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { ProviderAccessEntity } from '../../database/entities/provider-access.entity';
import { PaginatedResult } from '../processed-events/processed-events.service';

interface ConfiguratorServiceListFilters {
  status?: string;
  limit?: number;
  page?: number;
}

@Injectable()
export class ConfiguratorService {
  constructor(
    @InjectRepository(ProvisionEntity)
    private readonly provisionsRepository: Repository<ProvisionEntity>,
    @InjectRepository(PolicyTemplateEntity)
    private readonly policyTemplatesRepository: Repository<PolicyTemplateEntity>,
  ) {}

  async listServices(
    filters: ConfiguratorServiceListFilters,
  ): Promise<PaginatedResult<ConfiguratorServiceSummary>> {
    const normalizedLimit = Number(filters.limit);
    const normalizedPage = Number(filters.page);
    const limit = Number.isFinite(normalizedLimit)
      ? Math.max(1, Math.min(normalizedLimit, 200))
      : 20;
    const page = Number.isFinite(normalizedPage)
      ? Math.max(normalizedPage, 1)
      : 1;

    const where: { status: ProvisionEntity['status'] } | undefined =
      filters.status
        ? { status: filters.status as ProvisionEntity['status'] }
        : undefined;
    const [items, total] = await this.provisionsRepository.findAndCount({
      where,
      relations: {
        plan: true,
        vpnNode: true,
        deviceConfigs: {
          node: true,
          providerAccesses: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      items: items.map((item) => this.mapServiceSummary(item)),
      total,
      page,
      limit,
    };
  }

  async getServiceById(id: string): Promise<ConfiguratorServiceDetail> {
    const provision = await this.provisionsRepository.findOne({
      where: { id },
      relations: {
        plan: true,
        vpnNode: true,
        deviceConfigs: {
          node: true,
          providerAccesses: true,
        },
      },
    });

    if (!provision) {
      throw new NotFoundException(`Configurator service not found: ${id}`);
    }

    return this.mapServiceDetail(provision);
  }

  async listPolicyTemplates(): Promise<ConfiguratorPolicyTemplateSummary[]> {
    const templates = await this.policyTemplatesRepository.find({
      order: {
        type: 'ASC',
        name: 'ASC',
      },
    });

    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      type: template.type,
      isDefault: template.isDefault,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    }));
  }

  private mapServiceSummary(
    provision: ProvisionEntity,
  ): ConfiguratorServiceSummary {
    const sortedConfigs = this.sortDeviceConfigs(provision.deviceConfigs ?? []);
    const activeConfigs = sortedConfigs.filter((item) => item.status === 'active');
    const latestConfig = sortedConfigs[0];

    return {
      id: provision.id,
      externalSubscriptionId: provision.externalSubscriptionId,
      externalUserId: provision.externalUserId,
      externalOrderId: provision.externalOrderId ?? null,
      email: provision.email,
      status: provision.status,
      serviceExpiresAt: provision.serviceExpiresAt?.toISOString() ?? null,
      error: provision.error ?? null,
      planName: provision.plan?.name ?? null,
      externalPlanId: provision.plan?.externalPlanId ?? null,
      deviceConfigCount: sortedConfigs.length,
      activeDeviceConfigCount: activeConfigs.length,
      latestConfigRevision: latestConfig?.configRevision ?? null,
      latestGeneratedAt: latestConfig?.generatedAt?.toISOString() ?? null,
      protocols: this.uniqueStrings(
        sortedConfigs.map((item) => item.protocol ?? ''),
      ),
      providers: this.uniqueStrings(
        sortedConfigs.flatMap((item) =>
          (item.providerAccesses ?? []).map((access) => access.provider),
        ),
      ),
      nodeName:
        latestConfig?.node?.name ??
        provision.vpnNode?.name ??
        provision.vpnNode?.host ??
        null,
    };
  }

  private mapServiceDetail(provision: ProvisionEntity): ConfiguratorServiceDetail {
    const sortedConfigs = this.sortDeviceConfigs(provision.deviceConfigs ?? []);

    return {
      id: provision.id,
      externalSubscriptionId: provision.externalSubscriptionId,
      externalUserId: provision.externalUserId,
      externalOrderId: provision.externalOrderId ?? null,
      email: provision.email,
      status: provision.status,
      serviceExpiresAt: provision.serviceExpiresAt?.toISOString() ?? null,
      deleteAfter: provision.deleteAfter?.toISOString() ?? null,
      deletedAt: provision.deletedAt?.toISOString() ?? null,
      error: provision.error ?? null,
      subscriptionLink: provision.subscriptionLink ?? null,
      plan: provision.plan
        ? {
            id: provision.plan.id,
            externalPlanId: provision.plan.externalPlanId,
            name: provision.plan.name,
            vpnEnabled: provision.plan.vpnEnabled,
            storageEnabled: provision.plan.storageEnabled,
            maxDevices: provision.plan.maxDevices ?? null,
          }
        : null,
      vpnNode: provision.vpnNode
        ? {
            id: provision.vpnNode.id,
            name: provision.vpnNode.name ?? null,
            country: provision.vpnNode.country ?? null,
            host: provision.vpnNode.host,
            healthStatus: provision.vpnNode.healthStatus,
          }
        : null,
      deviceConfigs: sortedConfigs.map((item) => this.mapDeviceConfig(item)),
    };
  }

  private mapDeviceConfig(deviceConfig: DeviceConfigEntity): ConfiguratorDeviceConfigDetail {
    const providerAccesses = [...(deviceConfig.providerAccesses ?? [])].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );

    return {
      id: deviceConfig.id,
      deviceId: deviceConfig.deviceId ?? null,
      orderId: deviceConfig.orderId ?? null,
      clientId: deviceConfig.clientId ?? null,
      installId: deviceConfig.installId ?? null,
      status: deviceConfig.status,
      runtimeType: deviceConfig.runtimeType ?? null,
      protocol: deviceConfig.protocol ?? null,
      configRevision: deviceConfig.configRevision ?? null,
      generatedAt: deviceConfig.generatedAt?.toISOString() ?? null,
      createdAt: deviceConfig.createdAt.toISOString(),
      updatedAt: deviceConfig.updatedAt.toISOString(),
      lastError: deviceConfig.lastError ?? null,
      runtimePayload: deviceConfig.runtimePayload ?? null,
      routingPolicy: deviceConfig.routingPolicyJson ?? null,
      automationPolicy: deviceConfig.automationPolicyJson ?? null,
      telemetryProfile: deviceConfig.telemetryProfileJson ?? null,
      node: deviceConfig.node
        ? {
            id: deviceConfig.node.id,
            name: deviceConfig.node.name ?? null,
            country: deviceConfig.node.country ?? null,
            host: deviceConfig.node.host,
            healthStatus: deviceConfig.node.healthStatus,
          }
        : null,
      providerAccesses: providerAccesses.map((access) =>
        this.mapProviderAccess(access),
      ),
    };
  }

  private mapProviderAccess(
    providerAccess: ProviderAccessEntity,
  ): ConfiguratorProviderAccessDetail {
    return {
      id: providerAccess.id,
      provider: providerAccess.provider,
      providerUserId: providerAccess.providerUserId ?? null,
      providerLogin: providerAccess.providerLogin ?? null,
      status: providerAccess.status,
      lastSyncedAt: providerAccess.lastSyncedAt?.toISOString() ?? null,
      createdAt: providerAccess.createdAt.toISOString(),
      updatedAt: providerAccess.updatedAt.toISOString(),
      providerMetadata: providerAccess.providerMetadataJson ?? null,
    };
  }

  private sortDeviceConfigs(items: DeviceConfigEntity[]): DeviceConfigEntity[] {
    return [...items].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
  }

  private uniqueStrings(values: string[]): string[] {
    return Array.from(
      new Set(values.map((value) => value.trim()).filter((value) => value !== '')),
    ).sort((left, right) => left.localeCompare(right));
  }
}

export interface ConfiguratorServiceSummary {
  id: string;
  externalSubscriptionId: string;
  externalUserId: string;
  externalOrderId: string | null;
  email: string;
  status: string;
  serviceExpiresAt: string | null;
  error: string | null;
  planName: string | null;
  externalPlanId: string | null;
  deviceConfigCount: number;
  activeDeviceConfigCount: number;
  latestConfigRevision: string | null;
  latestGeneratedAt: string | null;
  protocols: string[];
  providers: string[];
  nodeName: string | null;
}

export interface ConfiguratorServiceDetail {
  id: string;
  externalSubscriptionId: string;
  externalUserId: string;
  externalOrderId: string | null;
  email: string;
  status: string;
  serviceExpiresAt: string | null;
  deleteAfter: string | null;
  deletedAt: string | null;
  error: string | null;
  subscriptionLink: string | null;
  plan: {
    id: string;
    externalPlanId: string;
    name: string;
    vpnEnabled: boolean;
    storageEnabled: boolean;
    maxDevices: number | null;
  } | null;
  vpnNode: {
    id: string;
    name: string | null;
    country: string | null;
    host: string;
    healthStatus: string;
  } | null;
  deviceConfigs: ConfiguratorDeviceConfigDetail[];
}

export interface ConfiguratorDeviceConfigDetail {
  id: string;
  deviceId: string | null;
  orderId: string | null;
  clientId: string | null;
  installId: string | null;
  status: string;
  runtimeType: string | null;
  protocol: string | null;
  configRevision: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  runtimePayload: string | null;
  routingPolicy: Record<string, unknown> | null;
  automationPolicy: Record<string, unknown> | null;
  telemetryProfile: Record<string, unknown> | null;
  node: {
    id: string;
    name: string | null;
    country: string | null;
    host: string;
    healthStatus: string;
  } | null;
  providerAccesses: ConfiguratorProviderAccessDetail[];
}

export interface ConfiguratorProviderAccessDetail {
  id: string;
  provider: string;
  providerUserId: string | null;
  providerLogin: string | null;
  status: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  providerMetadata: Record<string, unknown> | null;
}

export interface ConfiguratorPolicyTemplateSummary {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
