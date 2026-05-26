import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransportProfileEntity,
  TransportProfileProtocol,
  TransportProfileSecurity,
  TransportProfileStatus,
  TransportProfileTransport,
} from '../../database/entities/transport-profile.entity';
import {
  VpnClient,
  VpnNodeCheckResult,
  VpnProviderInbound,
} from '../../integrations/vpn/vpn-client.interface';
import { VPN_CLIENT } from '../../integrations/vpn/vpn.module';
import { CreateTransportProfileDto } from './dto/create-transport-profile.dto';
import { UpdateTransportProfileDto } from './dto/update-transport-profile.dto';
import { VpnNodesService } from './vpn-nodes.service';

@Injectable()
export class TransportProfilesService {
  constructor(
    @InjectRepository(TransportProfileEntity)
    private readonly repository: Repository<TransportProfileEntity>,
    @Inject(VPN_CLIENT)
    private readonly vpnClient: VpnClient,
    private readonly vpnNodesService: VpnNodesService,
  ) {}

  async list(nodeId: string): Promise<TransportProfileEntity[]> {
    await this.vpnNodesService.findById(nodeId);

    return this.repository.find({
      where: { nodeId },
      order: {
        priority: 'ASC',
        createdAt: 'ASC',
      },
    });
  }

  async findById(
    nodeId: string,
    profileId: string,
  ): Promise<TransportProfileEntity> {
    const profile = await this.repository.findOne({
      where: {
        id: profileId,
        nodeId,
      },
    });

    if (!profile) {
      throw new NotFoundException(`Transport profile not found: ${profileId}`);
    }

    return profile;
  }

  async create(
    nodeId: string,
    input: CreateTransportProfileDto,
  ): Promise<TransportProfileEntity> {
    await this.vpnNodesService.findById(nodeId);

    const profile = this.repository.create({
      ...this.normalizeInput(input),
      nodeId,
      provider: this.cleanRequired(input.provider ?? '3x-ui', 'provider'),
      priority: input.priority ?? 100,
      weight: input.weight ?? 100,
      status: input.status ?? 'draft',
    });

    return this.repository.save(profile);
  }

  async update(
    nodeId: string,
    profileId: string,
    input: UpdateTransportProfileDto,
  ): Promise<TransportProfileEntity> {
    const profile = await this.findById(nodeId, profileId);
    const normalized = this.normalizeInput(input);

    Object.assign(profile, normalized);

    return this.repository.save(profile);
  }

  async remove(nodeId: string, profileId: string): Promise<void> {
    const profile = await this.findById(nodeId, profileId);
    await this.repository.remove(profile);
  }

  async selectRuntimeProfile(
    nodeId: string,
  ): Promise<TransportProfileEntity | null> {
    const activeProfile = await this.selectRuntimeProfileByStatus(
      nodeId,
      'active',
    );
    if (activeProfile) {
      return activeProfile;
    }

    return this.selectRuntimeProfileByStatus(nodeId, 'degraded');
  }

  async syncFromProvider(nodeId: string): Promise<{
    created: number;
    updated: number;
    skipped: number;
    profiles: TransportProfileEntity[];
  }> {
    const node = await this.vpnNodesService.findById(nodeId);
    const inbounds = await this.vpnClient.listInbounds({
      id: node.id,
      host: node.host,
      apiKey: node.apiKey,
      apiVersion: node.apiVersion ?? undefined,
      subscriptionBaseUrl: node.subscriptionBaseUrl ?? undefined,
    });
    const existingProfiles = await this.repository.find({
      where: { nodeId },
    });
    const existingByInboundId = new Map(
      existingProfiles
        .filter(
          (profile) =>
            profile.providerInboundId !== null &&
            profile.providerInboundId !== undefined,
        )
        .map((profile) => [profile.providerInboundId as number, profile]),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const savedProfiles: TransportProfileEntity[] = [];

    for (const inbound of inbounds) {
      const mapped = this.profilePatchFromInbound(inbound);
      if (!mapped) {
        skipped += 1;
        continue;
      }

      const existing = existingByInboundId.get(inbound.id);
      if (existing) {
        Object.assign(existing, {
          ...mapped,
          status: this.statusAfterProviderSync(existing.status, inbound),
          metadataJson: this.providerMetadata(inbound),
        });
        savedProfiles.push(await this.repository.save(existing));
        updated += 1;
      } else {
        savedProfiles.push(
          await this.repository.save(
            this.repository.create({
              ...mapped,
              nodeId,
              provider: '3x-ui',
              providerInboundId: inbound.id,
              priority: 100,
              weight: 100,
              status: inbound.enable === false ? 'disabled' : 'active',
              metadataJson: this.providerMetadata(inbound),
            }),
          ),
        );
        created += 1;
      }
    }

    return {
      created,
      updated,
      skipped,
      profiles: savedProfiles,
    };
  }

  async check(
    nodeId: string,
    profileId: string,
  ): Promise<{
    profile: TransportProfileEntity;
    check: VpnNodeCheckResult;
  }> {
    const [node, profile] = await Promise.all([
      this.vpnNodesService.findById(nodeId),
      this.findById(nodeId, profileId),
    ]);
    const checkedAt = new Date();

    try {
      if (
        profile.providerInboundId === undefined ||
        profile.providerInboundId === null
      ) {
        throw new Error('Provider inbound id is not configured');
      }

      const check = await this.vpnClient.checkNode(
        {
          id: node.id,
          host: node.host,
          apiKey: node.apiKey,
          apiVersion: node.apiVersion ?? undefined,
          inboundId: profile.providerInboundId,
          subscriptionBaseUrl: node.subscriptionBaseUrl ?? undefined,
        },
        { forceReauth: true },
      );

      profile.lastCheckAt = checkedAt;
      profile.lastError = null;
      profile.status = this.statusAfterSuccessfulCheck(profile.status);
      const savedProfile = await this.repository.save(profile);

      return {
        profile: savedProfile,
        check,
      };
    } catch (error) {
      profile.lastCheckAt = checkedAt;
      profile.lastError = error instanceof Error ? error.message : String(error);
      profile.status = this.statusAfterFailedCheck(profile.status);
      await this.repository.save(profile);
      throw error;
    }
  }

  private normalizeInput(
    input: CreateTransportProfileDto | UpdateTransportProfileDto,
  ): Partial<TransportProfileEntity> {
    const output: Partial<TransportProfileEntity> = {};

    if (input.name !== undefined) {
      output.name = this.cleanRequired(input.name, 'name');
    }
    if (input.provider !== undefined) {
      output.provider = this.cleanRequired(input.provider, 'provider');
    }
    if (input.providerInboundId !== undefined) {
      output.providerInboundId = input.providerInboundId;
    }
    if (input.protocol !== undefined) {
      output.protocol = input.protocol;
    }
    if (input.transport !== undefined) {
      output.transport = input.transport;
    }
    if (input.security !== undefined) {
      output.security = input.security;
    }
    if (input.port !== undefined) {
      output.port = input.port;
    }
    if (input.sni !== undefined) {
      output.sni = this.clean(input.sni);
    }
    if (input.hostHeader !== undefined) {
      output.hostHeader = this.clean(input.hostHeader);
    }
    if (input.path !== undefined) {
      output.path = this.clean(input.path);
    }
    if (input.serviceName !== undefined) {
      output.serviceName = this.clean(input.serviceName);
    }
    if (input.alpn !== undefined) {
      output.alpn = this.clean(input.alpn);
    }
    if (input.fingerprint !== undefined) {
      output.fingerprint = this.clean(input.fingerprint);
    }
    if (input.flow !== undefined) {
      output.flow = this.clean(input.flow);
    }
    if (input.publicKey !== undefined) {
      output.publicKey = this.clean(input.publicKey);
    }
    if (input.shortId !== undefined) {
      output.shortId = this.clean(input.shortId);
    }
    if (input.spiderX !== undefined) {
      output.spiderX = this.clean(input.spiderX);
    }
    if (input.priority !== undefined) {
      output.priority = input.priority;
    }
    if (input.weight !== undefined) {
      output.weight = input.weight;
    }
    if (input.status !== undefined) {
      output.status = input.status;
    }
    if (input.lastError !== undefined) {
      output.lastError = this.clean(input.lastError);
    }
    if (input.metadataJson !== undefined) {
      output.metadataJson = input.metadataJson;
    }

    return output;
  }

  private clean(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    const cleanValue = value?.trim();
    return cleanValue ? cleanValue : null;
  }

  private cleanRequired(value: string | null | undefined, field: string): string {
    const cleanValue = value?.trim();
    if (!cleanValue) {
      throw new BadRequestException(`${field} must not be empty`);
    }

    return cleanValue;
  }

  private statusAfterSuccessfulCheck(
    status: TransportProfileStatus,
  ): TransportProfileStatus {
    return status === 'disabled' ? status : 'active';
  }

  private statusAfterFailedCheck(
    status: TransportProfileStatus,
  ): TransportProfileStatus {
    return status === 'disabled' || status === 'blocked' ? status : 'degraded';
  }

  private profilePatchFromInbound(
    inbound: VpnProviderInbound,
  ): Partial<TransportProfileEntity> | null {
    const protocol = this.supportedProtocol(inbound.protocol);
    if (!protocol) {
      return null;
    }

    const streamSettings = inbound.streamSettings ?? {};
    const settings = inbound.settings ?? {};
    const network = this.stringAt(streamSettings, 'network') ?? 'tcp';
    const transport = this.supportedTransport(network);
    const security = this.supportedSecurity(
      this.stringAt(streamSettings, 'security'),
      streamSettings,
    );
    const realitySettings = this.recordAt(streamSettings, 'realitySettings');
    const realityInnerSettings = this.recordAt(realitySettings, 'settings');
    const tlsSettings = this.recordAt(streamSettings, 'tlsSettings');
    const wsSettings = this.recordAt(streamSettings, 'wsSettings');
    const wsHeaders = this.recordAt(wsSettings, 'headers');
    const grpcSettings = this.recordAt(streamSettings, 'grpcSettings');
    const httpSettings = this.recordAt(streamSettings, 'httpSettings');
    const clients = Array.isArray(settings.clients) ? settings.clients : [];
    const firstClient = this.isRecord(clients[0]) ? clients[0] : null;

    return {
      name:
        inbound.remark ??
        `${protocol}/${transport}/${security}:${inbound.port ?? 443}`,
      provider: '3x-ui',
      providerInboundId: inbound.id,
      protocol,
      transport,
      security,
      port: inbound.port ?? 443,
      sni:
        this.firstString(
          this.stringAt(realitySettings, 'serverName'),
          this.firstArrayString(realitySettings?.serverNames),
          this.stringAt(realityInnerSettings, 'serverName'),
          this.stringAt(tlsSettings, 'serverName'),
        ) ?? null,
      hostHeader:
        this.firstString(
          this.stringAt(wsHeaders, 'Host'),
          this.stringAt(wsHeaders, 'host'),
          this.firstArrayString(httpSettings?.host),
        ) ?? null,
      path:
        this.firstString(
          this.stringAt(wsSettings, 'path'),
          this.stringAt(httpSettings, 'path'),
        ) ?? null,
      serviceName: this.stringAt(grpcSettings, 'serviceName') ?? null,
      alpn:
        this.firstString(
          this.joinStringArray(realitySettings?.alpn),
          this.joinStringArray(tlsSettings?.alpn),
        ) ?? null,
      fingerprint:
        this.firstString(
          this.stringAt(realitySettings, 'fingerprint'),
          this.stringAt(realityInnerSettings, 'fingerprint'),
          this.stringAt(tlsSettings, 'fingerprint'),
        ) ?? null,
      flow: this.stringAt(firstClient, 'flow') ?? null,
      publicKey:
        this.firstString(
          this.stringAt(realitySettings, 'publicKey'),
          this.stringAt(realityInnerSettings, 'publicKey'),
        ) ?? null,
      shortId:
        this.firstString(
          this.stringAt(realitySettings, 'shortId'),
          this.firstArrayString(realitySettings?.shortIds),
          this.stringAt(realityInnerSettings, 'shortId'),
        ) ?? null,
      spiderX:
        this.firstString(
          this.stringAt(realitySettings, 'spiderX'),
          this.stringAt(realityInnerSettings, 'spiderX'),
        ) ?? null,
    };
  }

  private statusAfterProviderSync(
    currentStatus: TransportProfileStatus,
    inbound: VpnProviderInbound,
  ): TransportProfileStatus {
    if (inbound.enable === false) {
      return 'disabled';
    }

    if (currentStatus === 'blocked' || currentStatus === 'degraded') {
      return currentStatus;
    }

    return 'active';
  }

  private providerMetadata(inbound: VpnProviderInbound): Record<string, unknown> {
    return {
      source: '3x-ui:list',
      importedAt: new Date().toISOString(),
      rawInbound: inbound.raw ?? null,
    };
  }

  private supportedProtocol(
    value: string | null | undefined,
  ): TransportProfileProtocol | null {
    const normalized = value?.toLowerCase();
    return normalized === 'vless' ||
      normalized === 'vmess' ||
      normalized === 'trojan' ||
      normalized === 'shadowsocks' ||
      normalized === 'wireguard'
      ? normalized
      : null;
  }

  private async selectRuntimeProfileByStatus(
    nodeId: string,
    status: TransportProfileStatus,
  ): Promise<TransportProfileEntity | null> {
    const profiles = await this.repository.find({
      where: {
        nodeId,
        status,
      },
      order: {
        priority: 'ASC',
        weight: 'DESC',
        updatedAt: 'DESC',
      },
    });

    return (
      profiles.find(
        (profile) =>
          profile.providerInboundId !== null &&
          profile.providerInboundId !== undefined &&
          this.isRuntimeProtocol(profile.protocol),
      ) ?? null
    );
  }

  private isRuntimeProtocol(protocol: TransportProfileProtocol): boolean {
    return (
      protocol === 'vless' ||
      protocol === 'vmess' ||
      protocol === 'trojan' ||
      protocol === 'shadowsocks'
    );
  }

  private supportedTransport(value: string | null | undefined): TransportProfileTransport {
    const normalized = value?.toLowerCase();
    if (
      normalized === 'tcp' ||
      normalized === 'ws' ||
      normalized === 'grpc' ||
      normalized === 'h2' ||
      normalized === 'http'
    ) {
      return normalized;
    }

    return 'tcp';
  }

  private supportedSecurity(
    value: string | null | undefined,
    streamSettings: Record<string, unknown>,
  ): TransportProfileSecurity {
    const normalized = value?.toLowerCase();
    if (
      normalized === 'none' ||
      normalized === 'tls' ||
      normalized === 'reality'
    ) {
      return normalized;
    }

    if (this.recordAt(streamSettings, 'realitySettings')) {
      return 'reality';
    }

    if (this.recordAt(streamSettings, 'tlsSettings')) {
      return 'tls';
    }

    return 'none';
  }

  private recordAt(
    record: Record<string, unknown> | null | undefined,
    key: string,
  ): Record<string, unknown> | null {
    const value = record?.[key];
    return this.isRecord(value) ? value : null;
  }

  private stringAt(
    record: Record<string, unknown> | null | undefined,
    key: string,
  ): string | null {
    const value = record?.[key];
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : null;
  }

  private firstString(...values: Array<string | null | undefined>): string | null {
    return values.find((value): value is string => Boolean(value)) ?? null;
  }

  private firstArrayString(value: unknown): string | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const match = value.find(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );

    return match?.trim() ?? null;
  }

  private joinStringArray(value: unknown): string | null {
    if (!Array.isArray(value)) {
      return typeof value === 'string' && value.trim() !== ''
        ? value.trim()
        : null;
    }

    const values = value.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );

    return values.length > 0 ? values.join(',') : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
