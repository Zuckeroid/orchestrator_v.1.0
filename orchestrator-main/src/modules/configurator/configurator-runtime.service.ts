import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { createHash } from 'crypto';
import { Agent as HttpsAgent } from 'https';
import { Repository } from 'typeorm';
import { BillingConfigSnapshot } from '../../integrations/billing/billing-provider.interface';
import {
  DeviceConfigEntity,
  DeviceConfigStatus,
} from '../../database/entities/device-config.entity';
import {
  PolicyTemplateEntity,
  PolicyTemplateType,
} from '../../database/entities/policy-template.entity';
import { ProvisionEntity, ProvisionStatus } from '../../database/entities/provision.entity';
import {
  ProviderAccessEntity,
  ProviderAccessStatus,
} from '../../database/entities/provider-access.entity';
import { VpnNodeEntity } from '../../database/entities/vpn-node.entity';
import {
  VpnClient,
  VpnClientResult,
  VpnNodeConfig,
} from '../../integrations/vpn/vpn-client.interface';
import { VPN_CLIENT } from '../../integrations/vpn/vpn.module';
import { VpnNodesService } from '../nodes/vpn-nodes.service';

@Injectable()
export class ConfiguratorRuntimeService {
  private readonly logger = new Logger(ConfiguratorRuntimeService.name);
  private readonly defaultRoutingPackages = [
    'com.android.chrome',
    'org.telegram.messenger',
    'com.whatsapp',
    'com.instagram.android',
    'com.zhiliaoapp.musically',
    'com.netflix.mediaclient',
    'com.spotify.music',
    'com.google.android.youtube',
    'com.google.android.apps.youtube.music',
    'ru.yandex.music',
    'deezer.android.app',
    'com.soundcloud.android',
    'com.aspiro.tidal',
  ];
  private readonly insecureHttpsAgent = new HttpsAgent({
    rejectUnauthorized: false,
  });

  constructor(
    @InjectRepository(ProvisionEntity)
    private readonly provisionsRepository: Repository<ProvisionEntity>,
    @InjectRepository(DeviceConfigEntity)
    private readonly deviceConfigsRepository: Repository<DeviceConfigEntity>,
    @InjectRepository(ProviderAccessEntity)
    private readonly providerAccessesRepository: Repository<ProviderAccessEntity>,
    @InjectRepository(PolicyTemplateEntity)
    private readonly policyTemplatesRepository: Repository<PolicyTemplateEntity>,
    @Inject(VPN_CLIENT)
    private readonly vpnClient: VpnClient,
    private readonly vpnNodesService: VpnNodesService,
  ) {}

  async syncProvisionSnapshot(provisionId: string): Promise<BillingConfigSnapshot | null> {
    const provision = await this.provisionsRepository.findOne({
      where: { id: provisionId },
      relations: {
        plan: true,
        vpnNode: true,
        deviceConfigs: {
          providerAccesses: true,
        },
      },
    });

    if (!provision) {
      this.logger.warn(`Configurator snapshot skipped for missing provision ${provisionId}`);
      return null;
    }

    const deviceConfig = await this.getOrCreateServiceConfig(provision);
    const providerAccess = await this.getOrCreateProviderAccess(deviceConfig);

    const nextDeviceStatus = this.mapDeviceStatus(provision.status);
    const nextProviderStatus = this.mapProviderStatus(provision.status);
    const now = new Date();

    if (!this.hasVpnMaterial(provision)) {
      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        clientId: provision.externalUserId,
        orderId: provision.externalOrderId ?? null,
        status: nextDeviceStatus,
        nodeId: provision.vpnNodeId ?? null,
        lastError:
          nextDeviceStatus === 'failed'
            ? provision.error ?? 'VPN runtime data is unavailable'
            : null,
      });

      await this.providerAccessesRepository.save({
        ...providerAccess,
        provider: '3x-ui',
        providerUserId: provision.externalSubscriptionId,
        providerLogin: provision.vpnLogin ?? null,
        status: nextProviderStatus,
        lastSyncedAt: now,
        providerMetadataJson: this.buildProviderMetadata(provision, null),
      });
      return this.buildBillingSnapshot(provision, {
        ready: false,
        runtimeType: deviceConfig.runtimeType ?? null,
        protocol: deviceConfig.protocol ?? null,
        configRevision: deviceConfig.configRevision ?? null,
        runtimePayload: null,
        generatedAt: deviceConfig.generatedAt?.toISOString() ?? null,
      });
    }

    if (provision.status !== 'active') {
      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        clientId: provision.externalUserId,
        orderId: provision.externalOrderId ?? null,
        status: nextDeviceStatus,
        nodeId: provision.vpnNodeId ?? null,
        lastError: provision.error ?? null,
      });

      await this.providerAccessesRepository.save({
        ...providerAccess,
        provider: '3x-ui',
        providerUserId: provision.externalSubscriptionId,
        providerLogin: provision.vpnLogin ?? null,
        status: nextProviderStatus,
        lastSyncedAt: now,
        providerMetadataJson: this.buildProviderMetadata(provision, null),
      });
      return this.buildBillingSnapshot(provision, {
        ready: false,
        runtimeType: deviceConfig.runtimeType ?? null,
        protocol: deviceConfig.protocol ?? null,
        configRevision: deviceConfig.configRevision ?? null,
        runtimePayload: null,
        generatedAt: deviceConfig.generatedAt?.toISOString() ?? null,
      });
    }

    try {
      const runtime = await this.buildRuntimeSnapshot(provision);
      const revision = this.buildRevision(provision, runtime);
      const clientPolicies = await this.resolveDefaultClientPolicies();

      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        clientId: provision.externalUserId,
        orderId: provision.externalOrderId ?? null,
        status: 'ready',
        runtimeType: 'xray_config',
        runtimePayload: runtime.payload,
        protocol: runtime.protocol,
        nodeId: provision.vpnNodeId ?? null,
        configRevision: revision,
        routingPolicyJson: clientPolicies.routingPolicy,
        automationPolicyJson: clientPolicies.automationPolicy,
        telemetryProfileJson: this.defaultTelemetryProfile(),
        lastError: null,
        generatedAt: now,
      });

      await this.providerAccessesRepository.save({
        ...providerAccess,
        provider: '3x-ui',
        providerUserId: provision.externalSubscriptionId,
        providerLogin: provision.vpnLogin ?? null,
        status: 'active',
        lastSyncedAt: now,
        providerMetadataJson: this.buildProviderMetadata(provision, {
          resolvedLink: runtime.sourceLink,
          sourceCount: runtime.sourceCount,
          protocol: runtime.protocol,
        }),
      });
      return this.buildBillingSnapshot(provision, {
        ready: true,
        runtimeType: 'xray_config',
        protocol: runtime.protocol,
        configRevision: revision,
        runtimePayload: runtime.payload,
        routingPolicy: clientPolicies.routingPolicy,
        automationPolicy: clientPolicies.automationPolicy,
        telemetryProfile: this.defaultTelemetryProfile(),
        generatedAt: now.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Configurator runtime generation failed for provision ${provision.externalSubscriptionId}: ${message}`,
      );

      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        clientId: provision.externalUserId,
        orderId: provision.externalOrderId ?? null,
        status: 'failed',
        nodeId: provision.vpnNodeId ?? null,
        lastError: message,
      });

      await this.providerAccessesRepository.save({
        ...providerAccess,
        provider: '3x-ui',
        providerUserId: provision.externalSubscriptionId,
        providerLogin: provision.vpnLogin ?? null,
        status: 'failed',
        lastSyncedAt: now,
        providerMetadataJson: this.buildProviderMetadata(provision, null),
      });
      return this.buildBillingSnapshot(provision, {
        ready: false,
        runtimeType: deviceConfig.runtimeType ?? null,
        protocol: deviceConfig.protocol ?? null,
        configRevision: deviceConfig.configRevision ?? null,
        runtimePayload: null,
        generatedAt: deviceConfig.generatedAt?.toISOString() ?? null,
      });
    }
  }

  async syncDeviceSnapshot(
    provisionId: string,
    device: ConfiguratorDeviceIdentity,
  ): Promise<BillingConfigSnapshot | null> {
    const provision = await this.provisionsRepository.findOne({
      where: { id: provisionId },
      relations: {
        plan: true,
        vpnNode: true,
      },
    });

    if (!provision) {
      this.logger.warn(`Device snapshot skipped for missing provision ${provisionId}`);
      return null;
    }

    const deviceConfig = await this.getOrCreateDeviceConfig(provision, device);
    const providerAccess = await this.getOrCreateProviderAccess(deviceConfig);
    const now = new Date();

    if (provision.status !== 'active') {
      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        ...this.deviceIdentityPatch(device),
        status: this.mapDeviceStatus(provision.status),
        lastError: provision.error ?? 'Service is not active',
      });
      await this.providerAccessesRepository.save({
        ...providerAccess,
        status: this.mapProviderStatus(provision.status),
        lastSyncedAt: now,
      });

      return this.buildBillingSnapshot(
        provision,
        {
          ready: false,
          runtimeType: deviceConfig.runtimeType ?? null,
          protocol: deviceConfig.protocol ?? null,
          configRevision: deviceConfig.configRevision ?? null,
          runtimePayload: null,
          generatedAt: deviceConfig.generatedAt?.toISOString() ?? null,
        },
        device,
      );
    }

    if (!provision.vpnNodeId || !provision.vpnNode) {
      const message = 'VPN node is not selected for this service';
      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        ...this.deviceIdentityPatch(device),
        status: 'failed',
        lastError: message,
      });
      await this.providerAccessesRepository.save({
        ...providerAccess,
        status: 'failed',
        lastSyncedAt: now,
      });

      return this.buildBillingSnapshot(
        provision,
        {
          ready: false,
          runtimeType: deviceConfig.runtimeType ?? null,
          protocol: deviceConfig.protocol ?? null,
          configRevision: deviceConfig.configRevision ?? null,
          runtimePayload: null,
          generatedAt: deviceConfig.generatedAt?.toISOString() ?? null,
        },
        device,
      );
    }

    let createdClient: VpnClientResult | null = null;
    let loadIncremented = false;

    try {
      const providerMaterial = await this.resolveDeviceProviderMaterial(
        provision,
        providerAccess,
        device,
      );
      createdClient = providerMaterial.createdClient;
      loadIncremented = providerMaterial.loadIncremented;

      const runtime = await this.buildRuntimeSnapshotFromLink(
        providerMaterial.subscriptionLink,
      );
      const revision = this.buildRevision(provision, runtime, device);
      const clientPolicies = await this.resolveDefaultClientPolicies();

      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        ...this.deviceIdentityPatch(device),
        status: 'ready',
        runtimeType: 'xray_config',
        runtimePayload: runtime.payload,
        protocol: runtime.protocol,
        nodeId: provision.vpnNodeId ?? null,
        configRevision: revision,
        routingPolicyJson: clientPolicies.routingPolicy,
        automationPolicyJson: clientPolicies.automationPolicy,
        telemetryProfileJson: this.defaultTelemetryProfile(),
        lastError: null,
        generatedAt: now,
      });

      await this.providerAccessesRepository.save({
        ...providerAccess,
        provider: '3x-ui',
        providerUserId: providerMaterial.login,
        providerLogin: providerMaterial.login,
        status: 'active',
        lastSyncedAt: now,
        providerMetadataJson: this.buildDeviceProviderMetadata(
          provision,
          device,
          providerMaterial.subscriptionLink,
          {
            resolvedLink: runtime.sourceLink,
            sourceCount: runtime.sourceCount,
            protocol: runtime.protocol,
          },
        ),
      });

      return this.buildBillingSnapshot(
        provision,
        {
          ready: true,
          runtimeType: 'xray_config',
          protocol: runtime.protocol,
          configRevision: revision,
          runtimePayload: runtime.payload,
          routingPolicy: clientPolicies.routingPolicy,
          automationPolicy: clientPolicies.automationPolicy,
          telemetryProfile: this.defaultTelemetryProfile(),
          generatedAt: now.toISOString(),
        },
        device,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Device runtime generation failed for provision ${provision.externalSubscriptionId}, device ${device.deviceId}: ${message}`,
      );

      if (createdClient && provision.vpnNode) {
        await this.deleteCreatedClientQuietly(provision.vpnNode, createdClient.login);
      }
      if (loadIncremented && provision.vpnNodeId) {
        await this.vpnNodesService.decrementLoad(provision.vpnNodeId);
      }

      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        ...this.deviceIdentityPatch(device),
        status: 'failed',
        nodeId: provision.vpnNodeId ?? null,
        lastError: message,
      });
      await this.providerAccessesRepository.save({
        ...providerAccess,
        provider: '3x-ui',
        status: 'failed',
        lastSyncedAt: now,
      });

      return this.buildBillingSnapshot(
        provision,
        {
          ready: false,
          runtimeType: deviceConfig.runtimeType ?? null,
          protocol: deviceConfig.protocol ?? null,
          configRevision: deviceConfig.configRevision ?? null,
          runtimePayload: null,
          generatedAt: deviceConfig.generatedAt?.toISOString() ?? null,
        },
        device,
      );
    }
  }

  async revokeDeviceSnapshot(
    provisionId: string,
    device: ConfiguratorDeviceIdentity,
    status: 'revoked' | 'deleted' = 'revoked',
  ): Promise<BillingConfigSnapshot | null> {
    const provision = await this.provisionsRepository.findOne({
      where: { id: provisionId },
      relations: {
        vpnNode: true,
      },
    });
    if (!provision) {
      return null;
    }

    const deviceConfig = await this.findDeviceConfig(provision.id, device);
    if (!deviceConfig) {
      return this.buildBillingSnapshot(
        provision,
        {
          ready: false,
          runtimeType: null,
          protocol: null,
          configRevision: null,
          runtimePayload: null,
          generatedAt: null,
        },
        device,
      );
    }

    await this.revokeProviderAccessesForDeviceConfig(
      provision,
      deviceConfig,
      status,
    );

    await this.deviceConfigsRepository.save({
      ...deviceConfig,
      status,
      runtimePayload: null,
      lastError: null,
    });

    return this.buildBillingSnapshot(
      provision,
      {
        ready: false,
        runtimeType: deviceConfig.runtimeType ?? null,
        protocol: deviceConfig.protocol ?? null,
        configRevision: deviceConfig.configRevision ?? null,
        runtimePayload: null,
        generatedAt: deviceConfig.generatedAt?.toISOString() ?? null,
      },
      device,
    );
  }

  async syncProvisionAndDeviceSnapshots(
    provisionId: string,
  ): Promise<BillingConfigSnapshot[]> {
    const snapshots: BillingConfigSnapshot[] = [];
    const serviceSnapshot = await this.syncProvisionSnapshot(provisionId);
    if (serviceSnapshot) {
      snapshots.push(serviceSnapshot);
    }

    const provision = await this.provisionsRepository.findOne({
      where: { id: provisionId },
      relations: {
        deviceConfigs: true,
      },
    });

    if (!provision) {
      return snapshots;
    }

    const deviceConfigs = (provision.deviceConfigs ?? []).filter(
      (deviceConfig) =>
        deviceConfig.status !== 'deleted' &&
        deviceConfig.status !== 'revoked' &&
        Boolean(deviceConfig.deviceId?.trim() || deviceConfig.installId?.trim()),
    );

    for (const deviceConfig of deviceConfigs) {
      const deviceSnapshot = await this.syncDeviceSnapshot(provisionId, {
        deviceId: deviceConfig.deviceId ?? '',
        orderId: deviceConfig.orderId ?? provision.externalOrderId ?? undefined,
        clientId: deviceConfig.clientId ?? provision.externalUserId ?? undefined,
        installId: deviceConfig.installId ?? undefined,
      });

      if (deviceSnapshot) {
        snapshots.push(deviceSnapshot);
      }
    }

    return snapshots;
  }

  async revokeProvisionDeviceAccesses(
    provisionId: string,
    status: 'revoked' | 'deleted' = 'revoked',
  ): Promise<void> {
    const provision = await this.provisionsRepository.findOne({
      where: { id: provisionId },
      relations: {
        vpnNode: true,
        deviceConfigs: {
          providerAccesses: true,
        },
      },
    });
    if (!provision) {
      return;
    }

    for (const deviceConfig of provision.deviceConfigs ?? []) {
      await this.revokeProviderAccessesForDeviceConfig(
        provision,
        deviceConfig,
        status,
      );
      await this.deviceConfigsRepository.save({
        ...deviceConfig,
        status,
        runtimePayload: null,
        lastError: null,
      });
    }
  }

  private async getOrCreateServiceConfig(
    provision: ProvisionEntity,
  ): Promise<DeviceConfigEntity> {
    const existing = (provision.deviceConfigs ?? []).find(
      (item) => !item.deviceId && !item.installId,
    );
    if (existing) {
      return existing;
    }

    return this.deviceConfigsRepository.save(
      this.deviceConfigsRepository.create({
        provisionId: provision.id,
        orderId: provision.externalOrderId ?? null,
        clientId: provision.externalUserId,
        status: 'pending',
        nodeId: provision.vpnNodeId ?? null,
      }),
    );
  }

  private async getOrCreateDeviceConfig(
    provision: ProvisionEntity,
    device: ConfiguratorDeviceIdentity,
  ): Promise<DeviceConfigEntity> {
    const existing = await this.findDeviceConfig(provision.id, device);
    if (existing) {
      return existing;
    }

    return this.deviceConfigsRepository.save(
      this.deviceConfigsRepository.create({
        provisionId: provision.id,
        ...this.deviceIdentityPatch(device),
        status: 'pending',
        nodeId: provision.vpnNodeId ?? null,
      }),
    );
  }

  private async findDeviceConfig(
    provisionId: string,
    device: ConfiguratorDeviceIdentity,
  ): Promise<DeviceConfigEntity | null> {
    const where = [];
    if (device.deviceId?.trim()) {
      where.push({
        provisionId,
        deviceId: device.deviceId.trim(),
      });
    }
    if (device.installId?.trim()) {
      where.push({
        provisionId,
        installId: device.installId.trim(),
      });
    }

    if (where.length === 0) {
      return null;
    }

    return this.deviceConfigsRepository.findOne({
      where,
      relations: {
        providerAccesses: true,
      },
      order: {
        updatedAt: 'DESC',
      },
    });
  }

  private deviceIdentityPatch(
    device: ConfiguratorDeviceIdentity,
  ): Pick<
    DeviceConfigEntity,
    'deviceId' | 'orderId' | 'clientId' | 'installId'
  > {
    return {
      deviceId: device.deviceId?.trim() || null,
      orderId: device.orderId?.trim() || null,
      clientId: device.clientId?.trim() || null,
      installId: device.installId?.trim() || null,
    };
  }

  private async getOrCreateProviderAccess(
    deviceConfig: DeviceConfigEntity,
  ): Promise<ProviderAccessEntity> {
    const existing = (deviceConfig.providerAccesses ?? []).find(
      (item) => item.provider === '3x-ui',
    );
    if (existing) {
      return existing;
    }

    return this.providerAccessesRepository.save(
      this.providerAccessesRepository.create({
        deviceConfigId: deviceConfig.id,
        provider: '3x-ui',
        status: 'pending',
      }),
    );
  }

  private async resolveDeviceProviderMaterial(
    provision: ProvisionEntity,
    providerAccess: ProviderAccessEntity,
    device: ConfiguratorDeviceIdentity,
  ): Promise<{
    login: string;
    subscriptionLink: string;
    createdClient: VpnClientResult | null;
    loadIncremented: boolean;
  }> {
    const existingLink = this.readProviderMetadataString(
      providerAccess.providerMetadataJson,
      'subscriptionLink',
    );
    const existingLogin = providerAccess.providerLogin?.trim();
    if (
      providerAccess.status === 'active' &&
      existingLogin &&
      existingLink
    ) {
      return {
        login: existingLogin,
        subscriptionLink: existingLink,
        createdClient: null,
        loadIncremented: false,
      };
    }

    if (!provision.vpnNodeId || !provision.vpnNode) {
      throw new Error('VPN node is not selected for this service');
    }

    const loadIncremented = await this.vpnNodesService.incrementLoad(
      provision.vpnNodeId,
    );
    if (!loadIncremented) {
      throw new Error('VPN node capacity was exhausted');
    }

    try {
      const createdClient = await this.vpnClient.createClient(
        this.toVpnNodeConfig(provision.vpnNode),
        {
          email: provision.email,
          externalSubscriptionId: this.buildDeviceExternalSubscriptionId(
            provision,
            device,
          ),
          limitIp: 1,
          expiresAt: provision.serviceExpiresAt ?? undefined,
        },
      );

      return {
        login: createdClient.login,
        subscriptionLink: createdClient.subscriptionLink,
        createdClient,
        loadIncremented,
      };
    } catch (error) {
      await this.vpnNodesService.decrementLoad(provision.vpnNodeId);
      throw error;
    }
  }

  private async revokeProviderAccessesForDeviceConfig(
    provision: ProvisionEntity,
    deviceConfig: DeviceConfigEntity,
    status: 'revoked' | 'deleted',
  ): Promise<void> {
    const providerAccesses =
      deviceConfig.providerAccesses ??
      (await this.providerAccessesRepository.find({
        where: { deviceConfigId: deviceConfig.id },
      }));
    const now = new Date();

    for (const providerAccess of providerAccesses) {
      const login = providerAccess.providerLogin?.trim();
      if (
        provision.vpnNode &&
        login &&
        (providerAccess.status === 'active' || providerAccess.status === 'failed')
      ) {
        await this.deleteCreatedClientQuietly(provision.vpnNode, login);
        if (provision.vpnNodeId) {
          await this.vpnNodesService.decrementLoad(provision.vpnNodeId);
        }
      }

      await this.providerAccessesRepository.save({
        ...providerAccess,
        status,
        lastSyncedAt: now,
      });
    }
  }

  private async deleteCreatedClientQuietly(
    node: VpnNodeEntity,
    login: string,
  ): Promise<void> {
    try {
      await this.vpnClient.deleteClient(this.toVpnNodeConfig(node), login);
    } catch (error) {
      this.logger.warn(
        `Provider client cleanup failed on node ${node.id}, login ${login}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private readProviderMetadataString(
    metadata: Record<string, unknown> | null | undefined,
    key: string,
  ): string | null {
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : null;
  }

  private hasVpnMaterial(provision: ProvisionEntity): boolean {
    return Boolean(
      provision.vpnNodeId &&
        provision.vpnNode &&
        provision.vpnLogin &&
        provision.subscriptionLink,
    );
  }

  private mapDeviceStatus(status: ProvisionStatus): DeviceConfigStatus {
    switch (status) {
      case 'active':
        return 'ready';
      case 'failed':
        return 'failed';
      case 'cancelled':
      case 'suspended':
      case 'deleted':
        return 'revoked';
      case 'pending':
      case 'provisioning':
      default:
        return 'pending';
    }
  }

  private mapProviderStatus(status: ProvisionStatus): ProviderAccessStatus {
    switch (status) {
      case 'active':
        return 'active';
      case 'failed':
        return 'failed';
      case 'deleted':
        return 'deleted';
      case 'cancelled':
      case 'suspended':
        return 'revoked';
      case 'pending':
      case 'provisioning':
      default:
        return 'pending';
    }
  }

  private async buildRuntimeSnapshot(provision: ProvisionEntity): Promise<{
    protocol: string;
    payload: string;
    sourceLink: string;
    sourceCount: number;
  }> {
    const subscriptionLink = provision.subscriptionLink?.trim();
    if (!subscriptionLink) {
      throw new Error('Provision has no subscription link');
    }

    return this.buildRuntimeSnapshotFromLink(subscriptionLink);
  }

  private async buildRuntimeSnapshotFromLink(subscriptionLink: string): Promise<{
    protocol: string;
    payload: string;
    sourceLink: string;
    sourceCount: number;
  }> {
    const resolvedLinks = await this.resolveProviderLinks(subscriptionLink);
    if (resolvedLinks.length === 0) {
      throw new Error('Provider subscription returned no supported node links');
    }

    const parsed = this.parseLink(resolvedLinks[0]);
    return {
      protocol: parsed.protocol,
      payload: JSON.stringify(this.buildXrayConfig(parsed.outbound), null, 2),
      sourceLink: resolvedLinks[0],
      sourceCount: resolvedLinks.length,
    };
  }

  private async resolveProviderLinks(subscriptionLink: string): Promise<string[]> {
    if (this.isSupportedNodeLink(subscriptionLink)) {
      return [subscriptionLink];
    }

    const response = await axios.get(subscriptionLink, {
      responseType: 'text',
      timeout: Number(process.env.CONFIGURATOR_RUNTIME_TIMEOUT ?? process.env.VPN_TIMEOUT ?? 15000),
      httpsAgent: this.httpsAgent(),
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Subscription fetch failed with HTTP ${response.status}`,
      );
    }

    const rawBody =
      typeof response.data === 'string'
        ? response.data
        : Buffer.from(response.data ?? '').toString('utf8');
    return this.extractSupportedLinks(rawBody);
  }

  private extractSupportedLinks(rawBody: string): string[] {
    const candidates = new Set<string>();
    const trimmed = rawBody.trim();

    this.collectLinksFromText(trimmed).forEach((item) => candidates.add(item));

    const decoded = this.tryDecodeBase64Subscription(trimmed);
    if (decoded) {
      this.collectLinksFromText(decoded).forEach((item) => candidates.add(item));
    }

    return [...candidates];
  }

  private collectLinksFromText(rawText: string): string[] {
    if (!rawText.trim()) {
      return [];
    }

    return rawText
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => this.isSupportedNodeLink(item));
  }

  private tryDecodeBase64Subscription(rawText: string): string | null {
    const normalized = rawText.replace(/\s+/g, '');
    if (!normalized || /:\/\//.test(normalized)) {
      return null;
    }

    if (!/^[A-Za-z0-9+/_=-]+$/.test(normalized)) {
      return null;
    }

    const padded = normalized
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(normalized.length / 4) * 4, '=');

    try {
      const decoded = Buffer.from(padded, 'base64').toString('utf8');
      return /(?:vless|vmess|trojan):\/\//i.test(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }

  private isSupportedNodeLink(value: string): boolean {
    return /^(vless|vmess|trojan):\/\//i.test(value.trim());
  }

  private parseLink(rawLink: string): ParsedLink {
    const normalized = rawLink.trim();
    if (/^vless:\/\//i.test(normalized)) {
      return this.parseVless(normalized);
    }
    if (/^trojan:\/\//i.test(normalized)) {
      return this.parseTrojan(normalized);
    }
    if (/^vmess:\/\//i.test(normalized)) {
      return this.parseVmess(normalized);
    }

    throw new Error(
      `Unsupported node link format: ${this.substringBefore(normalized, '://')}`,
    );
  }

  private parseVless(rawLink: string): ParsedLink {
    const url = new URL(rawLink);
    const userId = this.decodePart(url.username);
    const host = url.hostname;
    const port = Number(url.port || 443);
    if (!userId || !host) {
      throw new Error('VLESS link is missing user id or host');
    }

    const query = this.queryMap(url.searchParams);
    const network = (this.firstValue(query, 'type', 'net') ?? 'tcp').toLowerCase();
    const security = (
      this.firstValue(query, 'security') ??
      (this.firstValue(query, 'tls')?.toLowerCase() === 'tls' ? 'tls' : 'none')
    )
      .toLowerCase()
      .trim();

    return {
      protocol: 'vless',
      outbound: {
        tag: 'proxy',
        protocol: 'vless',
        settings: {
          vnext: [
            {
              address: host,
              port,
              users: [
                {
                  id: userId,
                  encryption: query.encryption?.trim() || 'none',
                  ...(query.flow?.trim() ? { flow: query.flow.trim() } : {}),
                },
              ],
            },
          ],
        },
        ...(this.buildStreamSettings(network, security, query)
          ? { streamSettings: this.buildStreamSettings(network, security, query) }
          : {}),
      },
    };
  }

  private parseTrojan(rawLink: string): ParsedLink {
    const url = new URL(rawLink);
    const password = this.decodePart(url.username);
    const host = url.hostname;
    const port = Number(url.port || 443);
    if (!password || !host) {
      throw new Error('Trojan link is missing password or host');
    }

    const query = this.queryMap(url.searchParams);
    const network = (this.firstValue(query, 'type', 'net') ?? 'tcp').toLowerCase();
    const security = (
      this.firstValue(query, 'security') ??
      (this.firstValue(query, 'tls')?.toLowerCase() === 'tls' ? 'tls' : 'tls')
    )
      .toLowerCase()
      .trim();

    return {
      protocol: 'trojan',
      outbound: {
        tag: 'proxy',
        protocol: 'trojan',
        settings: {
          servers: [
            {
              address: host,
              port,
              password,
            },
          ],
        },
        ...(this.buildStreamSettings(network, security, query)
          ? { streamSettings: this.buildStreamSettings(network, security, query) }
          : {}),
      },
    };
  }

  private parseVmess(rawLink: string): ParsedLink {
    const payload = this.parseVmessPayload(rawLink);
    const host = payload.add?.trim();
    const port = Number(payload.port || 443);
    if (!host) {
      throw new Error('VMESS link has no address');
    }

    const security = (
      payload.security?.trim() ||
      (payload.tls?.toLowerCase() === 'tls' ? 'tls' : 'none')
    ).toLowerCase();
    const network = (payload.net?.trim() || 'tcp').toLowerCase();
    const query = {
      ...payload,
      type: network,
      ...(security !== 'none' ? { security } : {}),
    };

    return {
      protocol: 'vmess',
      outbound: {
        tag: 'proxy',
        protocol: 'vmess',
        settings: {
          vnext: [
            {
              address: host,
              port,
              users: [
                {
                  id: payload.id ?? '',
                  alterId: Number(payload.aid ?? 0) || 0,
                  security: payload.scy?.trim() || 'auto',
                },
              ],
            },
          ],
        },
        ...(this.buildStreamSettings(network, security, query)
          ? { streamSettings: this.buildStreamSettings(network, security, query) }
          : {}),
      },
    };
  }

  private parseVmessPayload(rawLink: string): Record<string, string> {
    const encoded = rawLink.replace(/^vmess:\/\//i, '').trim();
    const normalized = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;

    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        acc[key] = String(value);
      }
      return acc;
    }, {});
  }

  private buildXrayConfig(primaryOutbound: Record<string, unknown>): Record<string, unknown> {
    return {
      log: {
        loglevel: 'warning',
      },
      inbounds: [
        {
          tag: 'tun-in',
          port: 0,
          protocol: 'tun',
          settings: {
            name: 'xray0',
            MTU: 1500,
          },
        },
      ],
      outbounds: [
        primaryOutbound,
        {
          tag: 'direct',
          protocol: 'freedom',
        },
        {
          tag: 'block',
          protocol: 'blackhole',
        },
      ],
      routing: {
        domainStrategy: 'IPIfNonMatch',
      },
    };
  }

  private buildStreamSettings(
    network: string,
    security: string,
    params: Record<string, string>,
  ): Record<string, unknown> | null {
    const normalizedNetwork = network.toLowerCase() === 'raw' ? 'tcp' : network.toLowerCase();
    const stream: Record<string, unknown> = {
      network: normalizedNetwork,
    };

    if (security !== 'none') {
      stream.security = security;
    }

    if (security === 'tls' || security === 'xtls') {
      const serverName = this.firstValue(
        params,
        'sni',
        'serverName',
        'servername',
        'peer',
        'host',
      );
      const tlsSettings: Record<string, unknown> = {};
      if (serverName) {
        tlsSettings.serverName = serverName.trim();
      }
      const alpn = this.firstValue(params, 'alpn');
      if (alpn) {
        tlsSettings.alpn = alpn
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      const allowInsecure = this.toBooleanLoose(
        this.firstValue(params, 'allowInsecure', 'insecure'),
      );
      if (allowInsecure !== null) {
        tlsSettings.allowInsecure = allowInsecure;
      }
      if (Object.keys(tlsSettings).length > 0) {
        stream.tlsSettings = tlsSettings;
      }
    }

    if (security === 'reality') {
      const realitySettings: Record<string, unknown> = {};
      const serverName = this.firstValue(
        params,
        'sni',
        'serverName',
        'servername',
        'peer',
        'host',
      );
      if (serverName) {
        realitySettings.serverName = serverName.trim();
      }
      const publicKey = this.firstValue(params, 'pbk', 'publicKey');
      if (publicKey) {
        realitySettings.publicKey = publicKey;
      }
      const shortId = this.firstValue(params, 'sid', 'shortId');
      if (shortId) {
        realitySettings.shortId = shortId;
      }
      const fingerprint = this.firstValue(params, 'fp', 'fingerprint');
      if (fingerprint) {
        realitySettings.fingerprint = fingerprint;
      }
      const spiderX = this.firstValue(params, 'spx', 'spiderX');
      if (spiderX) {
        realitySettings.spiderX = this.decodePart(spiderX);
      }
      if (Object.keys(realitySettings).length > 0) {
        stream.realitySettings = realitySettings;
      }
    }

    if (normalizedNetwork === 'ws') {
      const path = this.decodePart(this.firstValue(params, 'path') ?? '') || '/';
      const wsSettings: Record<string, unknown> = { path };
      const hostHeader = this.firstValue(params, 'host', 'authority', 'sni');
      if (hostHeader) {
        wsSettings.headers = { Host: hostHeader };
      }
      stream.wsSettings = wsSettings;
    }

    if (normalizedNetwork === 'grpc') {
      const grpcSettings: Record<string, unknown> = {};
      const serviceName =
        this.firstValue(params, 'serviceName', 'service_name') ??
        this.decodePart(this.firstValue(params, 'path') ?? '').replace(/^\/+|\/+$/g, '');
      if (serviceName) {
        grpcSettings.serviceName = serviceName;
      }
      const authority = this.firstValue(params, 'authority', 'host', 'sni');
      if (authority) {
        grpcSettings.authority = authority;
      }
      if ((params.mode ?? '').toLowerCase() === 'multi') {
        grpcSettings.multiMode = true;
      }
      if (Object.keys(grpcSettings).length > 0) {
        stream.grpcSettings = grpcSettings;
      }
    }

    if (normalizedNetwork === 'http' || normalizedNetwork === 'h2') {
      const path = this.decodePart(this.firstValue(params, 'path') ?? '') || '/';
      const httpSettings: Record<string, unknown> = { path };
      const host = this.firstValue(params, 'host');
      if (host) {
        httpSettings.host = [host];
      }
      stream.httpSettings = httpSettings;
    }

    if (
      normalizedNetwork === 'tcp' &&
      (this.firstValue(params, 'headerType') ?? '').toLowerCase() === 'http'
    ) {
      const host = this.firstValue(params, 'host');
      const path = this.decodePart(this.firstValue(params, 'path') ?? '') || '/';
      stream.tcpSettings = {
        header: {
          type: 'http',
          request: {
            path: [path],
            ...(host
              ? {
                  headers: {
                    Host: [host],
                  },
                }
              : {}),
          },
        },
      };
    }

    const hasSecurity = stream.security !== undefined;
    const hasTransport =
      stream.wsSettings !== undefined ||
      stream.grpcSettings !== undefined ||
      stream.httpSettings !== undefined;
    const hasTcpSettings = stream.tcpSettings !== undefined;

    if (!hasSecurity && !hasTransport && !hasTcpSettings && normalizedNetwork === 'tcp') {
      return null;
    }

    return stream;
  }

  private async resolveDefaultClientPolicies(): Promise<{
    routingPolicy: Record<string, unknown>;
    automationPolicy: Record<string, unknown>;
  }> {
    const [routingPolicy, automationPolicy] = await Promise.all([
      this.defaultPolicyTemplate('routing', this.defaultRoutingPolicy()),
      this.defaultPolicyTemplate('automation', this.defaultAutomationPolicy()),
    ]);

    return {
      routingPolicy,
      automationPolicy,
    };
  }

  private async defaultPolicyTemplate(
    type: PolicyTemplateType,
    fallback: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const template = await this.policyTemplatesRepository.findOne({
      where: {
        type,
        isDefault: true,
      },
      order: {
        updatedAt: 'DESC',
      },
    });

    return this.normalizeDefaultPolicy(
      type,
      template?.payloadJson ?? fallback,
      fallback,
    );
  }

  private defaultRoutingPolicy(): Record<string, unknown> {
    return {
      version: 1,
      mode: 'selected_apps',
      includedApps: this.defaultRoutingPackages,
      excludedApps: [],
    };
  }

  private defaultAutomationPolicy(): Record<string, unknown> {
    return {
      version: 1,
      autoConnectApps: [],
      autoDisconnectApps: [],
      requiresUsageAccess: true,
    };
  }

  private defaultTelemetryProfile(): Record<string, unknown> {
    return {
      mode: 'manual',
    };
  }

  private normalizeDefaultPolicy(
    type: PolicyTemplateType,
    payload: Record<string, unknown>,
    fallback: Record<string, unknown>,
  ): Record<string, unknown> {
    if (type !== 'routing') {
      return payload;
    }

    const mode =
      typeof payload.mode === 'string' && payload.mode.trim() !== ''
        ? payload.mode.trim()
        : 'selected_apps';
    if (mode !== 'selected_apps') {
      return payload;
    }

    const includedApps = Array.isArray(payload.includedApps)
      ? payload.includedApps.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];

    return includedApps.length > 0 ? payload : fallback;
  }

  private buildProviderMetadata(
    provision: ProvisionEntity,
    runtime: {
      resolvedLink: string;
      sourceCount: number;
      protocol: string;
    } | null,
  ): Record<string, unknown> {
    return {
      externalSubscriptionId: provision.externalSubscriptionId,
      subscriptionLink: provision.subscriptionLink ?? null,
      nodeId: provision.vpnNodeId ?? null,
      nodeHost: provision.vpnNode?.host ?? null,
      ...(runtime
        ? {
            resolvedLink: runtime.resolvedLink,
            sourceCount: runtime.sourceCount,
            protocol: runtime.protocol,
          }
        : {}),
    };
  }

  private buildDeviceProviderMetadata(
    provision: ProvisionEntity,
    device: ConfiguratorDeviceIdentity,
    subscriptionLink: string,
    runtime: {
      resolvedLink: string;
      sourceCount: number;
      protocol: string;
    },
  ): Record<string, unknown> {
    return {
      externalSubscriptionId: provision.externalSubscriptionId,
      deviceId: device.deviceId ?? null,
      deviceName: device.deviceName ?? null,
      platform: device.platform ?? null,
      installId: device.installId ?? null,
      subscriptionLink,
      nodeId: provision.vpnNodeId ?? null,
      nodeHost: provision.vpnNode?.host ?? null,
      resolvedLink: runtime.resolvedLink,
      sourceCount: runtime.sourceCount,
      protocol: runtime.protocol,
    };
  }

  private buildRevision(
    provision: ProvisionEntity,
    runtime: { payload: string; protocol: string },
    device?: ConfiguratorDeviceIdentity,
  ): string {
    const hash = createHash('sha1')
      .update(
        JSON.stringify({
          provisionId: provision.id,
          externalSubscriptionId: provision.externalSubscriptionId,
          deviceId: device?.deviceId ?? null,
          installId: device?.installId ?? null,
          nodeId: provision.vpnNodeId ?? null,
          protocol: runtime.protocol,
          payload: runtime.payload,
        }),
      )
      .digest('hex')
      .slice(0, 12);

    return `rev_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${hash}`;
  }

  private buildBillingSnapshot(
    provision: ProvisionEntity,
    payload: {
      ready: boolean;
      runtimeType: string | null;
      protocol: string | null;
      configRevision: string | null;
      runtimePayload: string | null;
      routingPolicy?: Record<string, unknown> | null;
      automationPolicy?: Record<string, unknown> | null;
      telemetryProfile?: Record<string, unknown> | null;
      generatedAt: string | null;
    },
    device?: ConfiguratorDeviceIdentity,
  ): BillingConfigSnapshot {
    return {
      ready: payload.ready,
      runtimeType: payload.runtimeType,
      protocol: payload.protocol,
      configRevision: payload.configRevision,
      runtimePayload: payload.runtimePayload,
      deviceId: device?.deviceId ?? null,
      deviceName: device?.deviceName ?? null,
      platform: device?.platform ?? null,
      installId: device?.installId ?? null,
      nodeId: provision.vpnNodeId ?? null,
      nodeLabel: provision.vpnNode?.name ?? provision.vpnNode?.host ?? null,
      nodeCountry: provision.vpnNode?.country ?? null,
      nodeHost: provision.vpnNode?.host ?? null,
      routingPolicy: payload.routingPolicy ?? null,
      automationPolicy: payload.automationPolicy ?? null,
      telemetryProfile: payload.telemetryProfile ?? null,
      generatedAt: payload.generatedAt,
    };
  }

  private buildDeviceExternalSubscriptionId(
    provision: ProvisionEntity,
    device: ConfiguratorDeviceIdentity,
  ): string {
    const suffix = device.deviceId?.trim() || device.installId?.trim() || 'device';

    return `${provision.externalSubscriptionId}_device_${suffix}`;
  }

  private toVpnNodeConfig(node: VpnNodeEntity): VpnNodeConfig {
    return {
      id: node.id,
      host: node.host,
      apiKey: node.apiKey,
      apiVersion: node.apiVersion ?? undefined,
      inboundId: node.inboundId ?? undefined,
      subscriptionBaseUrl: node.subscriptionBaseUrl ?? undefined,
    };
  }

  private queryMap(searchParams: URLSearchParams): Record<string, string> {
    const result: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      result[this.decodePart(key)] = this.decodePart(value);
    });
    return result;
  }

  private firstValue(
    values: Record<string, string>,
    ...keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = values[key]?.trim();
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private decodePart(raw: string | undefined): string {
    if (!raw) {
      return '';
    }

    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  private toBooleanLoose(raw: string | undefined): boolean | null {
    if (!raw) {
      return null;
    }

    switch (raw.trim().toLowerCase()) {
      case 'true':
      case '1':
      case 'yes':
      case 'on':
        return true;
      case 'false':
      case '0':
      case 'no':
      case 'off':
        return false;
      default:
        return null;
    }
  }

  private httpsAgent(): HttpsAgent | undefined {
    const rejectUnauthorized = (
      process.env.VPN_3XUI_TLS_REJECT_UNAUTHORIZED ?? 'true'
    ).toLowerCase();

    return rejectUnauthorized === 'false' ? this.insecureHttpsAgent : undefined;
  }

  private substringBefore(value: string, separator: string): string {
    const index = value.indexOf(separator);
    return index >= 0 ? value.slice(0, index) : value;
  }
}

interface ParsedLink {
  protocol: string;
  outbound: Record<string, unknown>;
}

export interface ConfiguratorDeviceIdentity {
  deviceId: string;
  deviceName?: string | null;
  platform?: string | null;
  installId?: string | null;
  orderId?: string | null;
  clientId?: string | null;
}
