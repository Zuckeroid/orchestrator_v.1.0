import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { AppPolicyAppEntity } from '../../database/entities/app-policy-app.entity';
import { DeviceConfigEntity } from '../../database/entities/device-config.entity';
import {
  PolicyTemplateEntity,
  PolicyTemplateType,
} from '../../database/entities/policy-template.entity';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { ProviderAccessEntity } from '../../database/entities/provider-access.entity';
import {
  BILLING_PROVIDER,
} from '../../integrations/billing/billing.module';
import { BillingProvider } from '../../integrations/billing/billing-provider.interface';
import { PaginatedResult } from '../processed-events/processed-events.service';
import { ConfiguratorRuntimeService } from './configurator-runtime.service';

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
    @InjectRepository(AppPolicyAppEntity)
    private readonly appPolicyAppsRepository: Repository<AppPolicyAppEntity>,
    @InjectRepository(PolicyTemplateEntity)
    private readonly policyTemplatesRepository: Repository<PolicyTemplateEntity>,
    @Inject(BILLING_PROVIDER)
    private readonly billingProvider: BillingProvider,
    private readonly configuratorRuntimeService: ConfiguratorRuntimeService,
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

  async listPolicyApps(): Promise<AppPolicyAppSummary[]> {
    const apps = await this.appPolicyAppsRepository.find({
      order: {
        isActive: 'DESC',
        category: 'ASC',
        name: 'ASC',
      },
    });

    return apps.map((app) => this.mapPolicyApp(app));
  }

  async createPolicyApp(input: CreateAppPolicyAppInput): Promise<AppPolicyAppSummary> {
    const packageName = this.normalizeRequired(input.packageName, 'Package name');
    await this.ensurePackageNameAvailable(packageName);

    const app = this.appPolicyAppsRepository.create({
      name: this.normalizeRequired(input.name, 'Application name'),
      packageName,
      platform: this.normalizeOptional(input.platform) ?? 'android',
      category: this.normalizeOptional(input.category),
      iconUrl: this.normalizeOptional(input.iconUrl),
      notes: this.normalizeOptional(input.notes),
      isActive: input.isActive ?? true,
    });

    return this.mapPolicyApp(await this.appPolicyAppsRepository.save(app));
  }

  async updatePolicyApp(
    id: string,
    input: UpdateAppPolicyAppInput,
  ): Promise<AppPolicyAppSummary> {
    const app = await this.getExistingPolicyApp(id);

    if (input.packageName !== undefined) {
      const packageName = this.normalizeRequired(input.packageName, 'Package name');
      await this.ensurePackageNameAvailable(packageName, id);
      app.packageName = packageName;
    }
    if (input.name !== undefined) {
      app.name = this.normalizeRequired(input.name, 'Application name');
    }
    if (input.platform !== undefined) {
      app.platform = this.normalizeOptional(input.platform) ?? 'android';
    }
    if (input.category !== undefined) {
      app.category = this.normalizeOptional(input.category);
    }
    if (input.iconUrl !== undefined) {
      app.iconUrl = this.normalizeOptional(input.iconUrl);
    }
    if (input.notes !== undefined) {
      app.notes = this.normalizeOptional(input.notes);
    }
    if (input.isActive !== undefined) {
      app.isActive = input.isActive;
    }

    return this.mapPolicyApp(await this.appPolicyAppsRepository.save(app));
  }

  async deletePolicyApp(id: string): Promise<void> {
    const app = await this.getExistingPolicyApp(id);
    await this.appPolicyAppsRepository.remove(app);
  }

  async listPolicyTemplates(
    type?: PolicyTemplateType,
  ): Promise<ConfiguratorPolicyTemplateSummary[]> {
    const where: FindOptionsWhere<PolicyTemplateEntity> | undefined = type
      ? { type }
      : undefined;
    const templates = await this.policyTemplatesRepository.find({
      where,
      order: {
        type: 'ASC',
        isDefault: 'DESC',
        name: 'ASC',
      },
    });

    return templates.map((template) => this.mapPolicyTemplate(template));
  }

  async createPolicyTemplate(
    input: CreatePolicyTemplateInput,
  ): Promise<ConfiguratorPolicyTemplateSummary> {
    const template = this.policyTemplatesRepository.create({
      name: this.normalizeRequired(input.name, 'Policy template name'),
      type: input.type,
      payloadJson: input.payload,
      isDefault: input.isDefault ?? false,
    });

    if (template.isDefault) {
      await this.clearDefaultTemplate(template.type);
    }

    return this.mapPolicyTemplate(await this.policyTemplatesRepository.save(template));
  }

  async updatePolicyTemplate(
    id: string,
    input: UpdatePolicyTemplateInput,
  ): Promise<ConfiguratorPolicyTemplateSummary> {
    const template = await this.getExistingPolicyTemplate(id);

    if (input.name !== undefined) {
      template.name = this.normalizeRequired(input.name, 'Policy template name');
    }
    if (input.type !== undefined) {
      template.type = input.type;
    }
    if (input.payload !== undefined) {
      template.payloadJson = input.payload;
    }
    if (input.isDefault !== undefined) {
      template.isDefault = input.isDefault;
    }

    if (template.isDefault) {
      await this.clearDefaultTemplate(template.type, template.id);
    }

    return this.mapPolicyTemplate(
      await this.policyTemplatesRepository.save(template),
    );
  }

  async deletePolicyTemplate(id: string): Promise<void> {
    const template = await this.getExistingPolicyTemplate(id);
    await this.policyTemplatesRepository.remove(template);
  }

  async regenerateServiceConfig(id: string): Promise<ConfiguratorServiceDetail> {
    const provision = await this.getExistingProvision(id);
    const snapshot = await this.configuratorRuntimeService.syncProvisionSnapshot(id);
    if (snapshot) {
      await this.billingProvider.updateDeviceConfig(
        provision.externalSubscriptionId,
        snapshot,
      );
    }
    return this.getServiceById(id);
  }

  private mapServiceSummary(
    provision: ProvisionEntity,
  ): ConfiguratorServiceSummary {
    const sortedConfigs = this.sortDeviceConfigs(provision.deviceConfigs ?? []);
    const activeConfigs = sortedConfigs.filter(
      (item) => item.status === 'active' || item.status === 'ready',
    );
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

  private mapPolicyApp(app: AppPolicyAppEntity): AppPolicyAppSummary {
    return {
      id: app.id,
      name: app.name,
      packageName: app.packageName,
      platform: app.platform,
      category: app.category ?? null,
      iconUrl: app.iconUrl ?? null,
      notes: app.notes ?? null,
      isActive: app.isActive,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    };
  }

  private mapPolicyTemplate(
    template: PolicyTemplateEntity,
  ): ConfiguratorPolicyTemplateSummary {
    return {
      id: template.id,
      name: template.name,
      type: template.type,
      payload: template.payloadJson,
      isDefault: template.isDefault,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }

  private async ensurePackageNameAvailable(
    packageName: string,
    currentId?: string,
  ): Promise<void> {
    const existing = await this.appPolicyAppsRepository.findOne({
      where: {
        packageName,
        ...(currentId ? { id: Not(currentId) } : {}),
      },
    });

    if (existing) {
      throw new ConflictException(`Application package already exists: ${packageName}`);
    }
  }

  private async clearDefaultTemplate(
    type: PolicyTemplateType,
    currentId?: string,
  ): Promise<void> {
    const query = this.policyTemplatesRepository
      .createQueryBuilder()
      .update(PolicyTemplateEntity)
      .set({ isDefault: false })
      .where('type = :type', { type });

    if (currentId) {
      query.andWhere('id != :currentId', { currentId });
    }

    await query.execute();
  }

  private async getExistingProvision(id: string): Promise<ProvisionEntity> {
    const provision = await this.provisionsRepository.findOne({
      where: { id },
    });

    if (!provision) {
      throw new NotFoundException(`Configurator service not found: ${id}`);
    }

    return provision;
  }

  private async getExistingPolicyApp(id: string): Promise<AppPolicyAppEntity> {
    const app = await this.appPolicyAppsRepository.findOneBy({ id });
    if (!app) {
      throw new NotFoundException(`Application policy app not found: ${id}`);
    }

    return app;
  }

  private async getExistingPolicyTemplate(
    id: string,
  ): Promise<PolicyTemplateEntity> {
    const template = await this.policyTemplatesRepository.findOneBy({ id });
    if (!template) {
      throw new NotFoundException(`Policy template not found: ${id}`);
    }

    return template;
  }

  private normalizeRequired(value: string, label: string): string {
    const normalized = this.normalizeOptional(value);
    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }

    return normalized;
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim();

    return normalized.length > 0 ? normalized : null;
  }
}

export interface CreateAppPolicyAppInput {
  name: string;
  packageName: string;
  platform?: string;
  category?: string | null;
  iconUrl?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface UpdateAppPolicyAppInput {
  name?: string;
  packageName?: string;
  platform?: string;
  category?: string | null;
  iconUrl?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface CreatePolicyTemplateInput {
  name: string;
  type: PolicyTemplateType;
  payload: Record<string, unknown>;
  isDefault?: boolean;
}

export interface UpdatePolicyTemplateInput {
  name?: string;
  type?: PolicyTemplateType;
  payload?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface AppPolicyAppSummary {
  id: string;
  name: string;
  packageName: string;
  platform: string;
  category: string | null;
  iconUrl: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  payload: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
