import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { Agent as HttpsAgent } from 'https';
import { v4 as uuid } from 'uuid';
import {
  CreateVpnClientInput,
  VpnClient,
  VpnClientResult,
  VpnNodeConfig,
  VpnNodeCheckOptions,
  VpnNodeCheckResult,
  VpnProviderInbound,
  VpnProviderInboundInput,
} from '../vpn-client.interface';

interface ThreeXuiCredentials {
  username: string;
  password: string;
}

interface ThreeXuiClientSettings {
  id?: string;
  password?: string;
  method?: string;
  email: string;
  enable: boolean;
  expiryTime: number;
  flow?: string;
  limitIp: number;
  reset: number;
  subId: string;
  tgId: string;
  totalGB: number;
}

interface ThreeXuiInbound {
  id: number;
  remark?: string;
  port?: number;
  protocol?: string;
  enable?: boolean;
  settings?: string | Record<string, unknown>;
  streamSettings?: string | Record<string, unknown>;
}

@Injectable()
export class ThreeXuiVpnClient implements VpnClient {
  private readonly logger = new Logger(ThreeXuiVpnClient.name);
  private readonly sessions = new Map<string, string>();
  private readonly insecureHttpsAgent = new HttpsAgent({
    rejectUnauthorized: false,
  });

  async listInbounds(node: VpnNodeConfig): Promise<VpnProviderInbound[]> {
    const response = await this.getWithSession<unknown>(
      node,
      this.inboundsPath('/list'),
    );

    return this.unwrapInboundListResponse(response).map((inbound) =>
      this.normalizeInbound(inbound),
    );
  }

  async createInbound(
    node: VpnNodeConfig,
    input: VpnProviderInboundInput,
  ): Promise<VpnProviderInbound> {
    const response = await this.postWithSessionResult<unknown>(
      node,
      this.inboundsPath('/add'),
      this.buildInboundWirePayload(input),
    );
    const createdInbound = this.unwrapInboundResponse(response);
    if (createdInbound) {
      return this.normalizeInbound(createdInbound);
    }

    const inbound = await this.findInboundBySignature(node, input);
    if (!inbound) {
      throw new Error(
        `3x-ui created inbound ${input.remark}, but it was not returned by the panel`,
      );
    }

    return inbound;
  }

  async updateInbound(
    node: VpnNodeConfig,
    inboundId: number,
    input: VpnProviderInboundInput,
  ): Promise<VpnProviderInbound> {
    const response = await this.postWithSessionResult<unknown>(
      node,
      this.inboundsPath(`/update/${inboundId}`),
      this.buildInboundWirePayload(input),
    );
    const updatedInbound = this.unwrapInboundResponse(response);
    if (updatedInbound) {
      return this.normalizeInbound(updatedInbound);
    }

    const fetched = await this.getWithSession<unknown>(
      node,
      this.inboundsPath(`/get/${inboundId}`),
    );
    const inbound = this.unwrapInboundResponse(fetched);
    if (!inbound) {
      throw new Error(`3x-ui inbound ${inboundId} was not found after update`);
    }

    return this.normalizeInbound(inbound);
  }

  async checkNode(
    node: VpnNodeConfig,
    options?: VpnNodeCheckOptions,
  ): Promise<VpnNodeCheckResult> {
    this.ensureInboundId(node);

    if (options?.forceReauth) {
      this.sessions.delete(node.id);
    }

    const inbound = await this.getInbound(node);
    const clientCount = this.countInboundClients(inbound);

    return {
      ok: true,
      provider: '3x-ui',
      inboundId: node.inboundId,
      inboundFound: true,
      clientCount,
      message: `3x-ui node is reachable; inbound ${node.inboundId} found`,
    };
  }

  async createClient(
    node: VpnNodeConfig,
    input: CreateVpnClientInput,
  ): Promise<VpnClientResult> {
    this.ensureInboundId(node);

    const clientId = uuid();
    const subId = clientId;
    const client = this.buildClientSettings(node, clientId, subId, input, true);

    await this.postWithSession(node, this.inboundsPath('/addClient'), {
      id: node.inboundId,
      settings: JSON.stringify({
        clients: [client],
      }),
    });

    this.logger.log(
      `3x-ui client created on node ${node.id} for ${input.externalSubscriptionId}`,
    );

    return {
      login: this.clientLogin(node, clientId, client),
      password: client.password,
      subscriptionLink: this.buildSubscriptionLink(node, subId),
    };
  }

  async updateClient(
    node: VpnNodeConfig,
    login: string,
    patch: Partial<CreateVpnClientInput> & { enable?: boolean },
  ): Promise<void> {
    this.ensureInboundId(node);

    const input = {
      email: patch.email ?? login,
      externalSubscriptionId: patch.externalSubscriptionId ?? login,
      limitIp: patch.limitIp ?? 0,
      expiresAt: patch.expiresAt,
    };
    const client = this.buildClientSettings(
      node,
      login,
      login,
      input,
      patch.enable ?? true,
    );

    await this.postWithSession(node, this.inboundsPath(`/updateClient/${login}`), {
      id: node.inboundId,
      settings: JSON.stringify({
        clients: [client],
      }),
    });

    this.logger.log(`3x-ui client updated on node ${node.id}: ${login}`);
  }

  async deleteClient(node: VpnNodeConfig, login: string): Promise<void> {
    this.ensureInboundId(node);

    await this.postWithSession(
      node,
      this.inboundsPath(`/${node.inboundId}/delClient/${login}`),
      {},
    );

    this.logger.log(`3x-ui client deleted on node ${node.id}: ${login}`);
  }

  private buildClientSettings(
    node: VpnNodeConfig,
    clientId: string,
    subId: string,
    input: CreateVpnClientInput,
    enable: boolean,
  ): ThreeXuiClientSettings {
    const base: ThreeXuiClientSettings = {
      email: this.buildClientEmail(input),
      enable,
      expiryTime:
        input.expiresAt?.getTime() ??
        Number(process.env.VPN_3XUI_CLIENT_EXPIRY_TIME ?? 0),
      limitIp: Math.max(Number(input.limitIp ?? 0), 0),
      reset: 0,
      subId,
      tgId: '',
      totalGB: Number(process.env.VPN_3XUI_CLIENT_TOTAL_GB ?? 0),
    };

    switch (this.normalizedProtocol(node)) {
      case 'trojan':
        return {
          ...base,
          password: clientId,
          flow: node.clientFlow ?? process.env.VPN_3XUI_CLIENT_FLOW ?? '',
        };
      case 'shadowsocks':
        return {
          ...base,
          method:
            process.env.VPN_3XUI_SHADOWSOCKS_METHOD ??
            'chacha20-ietf-poly1305',
          password: clientId,
        };
      case 'vless':
      case 'vmess':
      default:
        return {
          ...base,
          id: clientId,
          flow:
            node.clientFlow ??
            process.env.VPN_3XUI_CLIENT_FLOW ??
            'xtls-rprx-vision',
        };
    }
  }

  private clientLogin(
    node: VpnNodeConfig,
    clientId: string,
    client: ThreeXuiClientSettings,
  ): string {
    switch (this.normalizedProtocol(node)) {
      case 'trojan':
        return client.password ?? clientId;
      case 'shadowsocks':
        return client.email;
      case 'vless':
      case 'vmess':
      default:
        return client.id ?? clientId;
    }
  }

  private normalizedProtocol(node: VpnNodeConfig): string {
    return node.protocol?.trim().toLowerCase() ?? 'vless';
  }

  private async postWithSession(
    node: VpnNodeConfig,
    path: string,
    data: Record<string, unknown>,
    retry = true,
  ): Promise<void> {
    await this.postWithSessionResult(node, path, data, retry);
  }

  private async postWithSessionResult<T>(
    node: VpnNodeConfig,
    path: string,
    data: Record<string, unknown>,
    retry = true,
  ): Promise<T> {
    const cookie = await this.getSessionCookie(node);
    const response = await axios.post(this.url(node, path), data, {
      headers: {
        Cookie: cookie,
      },
      httpsAgent: this.httpsAgent(),
      timeout: this.timeout(),
      validateStatus: () => true,
    });

    if (
      retry &&
      (response.status === 401 || response.status === 403 || response.status === 404)
    ) {
      this.sessions.delete(node.id);
      return this.postWithSessionResult<T>(node, path, data, false);
    }

    this.assertSuccess(response, path);

    return response.data as T;
  }

  private async getWithSession<T>(
    node: VpnNodeConfig,
    path: string,
    retry = true,
  ): Promise<T> {
    const cookie = await this.getSessionCookie(node);
    const response = await axios.get(this.url(node, path), {
      headers: {
        Cookie: cookie,
      },
      httpsAgent: this.httpsAgent(),
      timeout: this.timeout(),
      validateStatus: () => true,
    });

    if (
      retry &&
      (response.status === 401 || response.status === 403 || response.status === 404)
    ) {
      this.sessions.delete(node.id);
      return this.getWithSession<T>(node, path, false);
    }

    this.assertSuccess(response, path);

    return response.data as T;
  }

  private async getInbound(node: VpnNodeConfig): Promise<ThreeXuiInbound> {
    const response = await this.getWithSession<unknown>(
      node,
      this.inboundsPath(`/get/${node.inboundId}`),
    );
    const inbound = this.unwrapInboundResponse(response);
    if (!inbound) {
      throw new Error(`3x-ui inbound ${node.inboundId} was not found`);
    }

    return inbound;
  }

  private unwrapInboundResponse(response: unknown): ThreeXuiInbound | undefined {
    if (!this.isRecord(response)) {
      return undefined;
    }

    const envelope = response as Record<string, unknown>;

    if (this.isInbound(envelope)) {
      return envelope;
    }

    const obj = envelope.obj;
    if (this.isInbound(obj)) {
      return obj;
    }

    const data = envelope.data;
    if (this.isInbound(data)) {
      return data;
    }

    return undefined;
  }

  private unwrapInboundListResponse(response: unknown): ThreeXuiInbound[] {
    if (Array.isArray(response)) {
      return response.filter((item): item is ThreeXuiInbound =>
        this.isInbound(item),
      );
    }

    if (!this.isRecord(response)) {
      return [];
    }

    const envelope = response as Record<string, unknown>;
    const candidates = [envelope.obj, envelope.data, envelope.inbounds];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item): item is ThreeXuiInbound =>
          this.isInbound(item),
        );
      }
    }

    return [];
  }

  private normalizeInbound(inbound: ThreeXuiInbound): VpnProviderInbound {
    return {
      id: inbound.id,
      remark: this.cleanString(inbound.remark),
      protocol: this.cleanString(inbound.protocol),
      port:
        typeof inbound.port === 'number' && Number.isFinite(inbound.port)
          ? inbound.port
          : null,
      enable: typeof inbound.enable === 'boolean' ? inbound.enable : null,
      settings: this.parseJsonRecord(inbound.settings),
      streamSettings: this.parseJsonRecord(inbound.streamSettings),
      raw: this.isRecord(inbound)
        ? (JSON.parse(JSON.stringify(inbound)) as Record<string, unknown>)
        : null,
    };
  }

  private buildInboundWirePayload(
    input: VpnProviderInboundInput,
  ): Record<string, unknown> {
    return {
      up: 0,
      down: 0,
      total: input.total ?? 0,
      remark: input.remark,
      enable: input.enable,
      expiryTime: input.expiryTime ?? 0,
      trafficReset: 'never',
      lastTrafficResetTime: 0,
      listen: input.listen ?? '',
      port: input.port,
      protocol: input.protocol,
      settings: JSON.stringify(input.settings),
      streamSettings: input.streamSettings
        ? JSON.stringify(input.streamSettings)
        : '',
      sniffing: JSON.stringify(input.sniffing ?? { enabled: false }),
      tag: '',
    };
  }

  private async findInboundBySignature(
    node: VpnNodeConfig,
    input: VpnProviderInboundInput,
  ): Promise<VpnProviderInbound | null> {
    const inbounds = await this.listInbounds(node);
    return (
      inbounds.find(
        (inbound) =>
          inbound.remark === input.remark &&
          inbound.protocol === input.protocol &&
          inbound.port === input.port,
      ) ?? null
    );
  }

  private countInboundClients(inbound: ThreeXuiInbound): number {
    const settings = this.parseJsonRecord(inbound.settings);
    if (!settings) {
      return 0;
    }

    const clients = settings.clients;
    return Array.isArray(clients) ? clients.length : 0;
  }

  private isInbound(value: unknown): value is ThreeXuiInbound {
    return this.isRecord(value) && typeof value.id === 'number';
  }

  private async getSessionCookie(node: VpnNodeConfig): Promise<string> {
    const existing = this.sessions.get(node.id);
    if (existing) {
      return existing;
    }

    const credentials = this.parseCredentials(node.apiKey);
    const loginParams = new URLSearchParams();
    loginParams.append('username', credentials.username);
    loginParams.append('password', credentials.password);
    const loginBody = loginParams.toString();
    const response = await axios.post(this.url(node, this.loginPath()), loginBody, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      httpsAgent: this.httpsAgent(),
      timeout: this.timeout(),
      validateStatus: () => true,
    });

    this.assertSuccess(response, 'login');

    const setCookie = response.headers['set-cookie'];
    if (!setCookie || setCookie.length === 0) {
      throw new Error(`3x-ui login did not return a session cookie for node ${node.id}`);
    }

    const cookie = setCookie.map((item) => item.split(';')[0]).join('; ');
    this.sessions.set(node.id, cookie);

    return cookie;
  }

  private assertSuccess(response: AxiosResponse, operation: string): void {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `3x-ui ${operation} failed with HTTP ${response.status}: ${this.responseMessage(response.data)}`,
      );
    }

    if (
      this.isRecord(response.data) &&
      response.data.success === false
    ) {
      throw new Error(
        `3x-ui ${operation} failed: ${this.responseMessage(response.data)}`,
      );
    }
  }

  private responseMessage(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    if (this.isRecord(data)) {
      if (typeof data.msg === 'string') {
        return data.msg;
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
    }

    return 'empty response';
  }

  private parseJsonRecord(
    value: string | Record<string, unknown> | undefined,
  ): Record<string, unknown> | null {
    if (!value) {
      return null;
    }

    if (this.isRecord(value)) {
      return value;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return this.isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private cleanString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : null;
  }

  private parseCredentials(apiKey: string): ThreeXuiCredentials {
    const raw = apiKey.trim();
    if (!raw) {
      throw new Error('3x-ui credentials are empty');
    }

    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<ThreeXuiCredentials>;
      if (parsed.username && parsed.password) {
        return {
          username: parsed.username,
          password: parsed.password,
        };
      }
    }

    const separator = raw.indexOf(':');
    if (separator > 0) {
      return {
        username: raw.slice(0, separator),
        password: raw.slice(separator + 1),
      };
    }

    throw new Error(
      '3x-ui apiKey must be JSON {"username":"...","password":"..."} or "username:password"',
    );
  }

  private buildClientEmail(input: CreateVpnClientInput): string {
    const email = (input.email || '').trim();
    const subscriptionId = input.externalSubscriptionId.trim();
    const safeEmail = email.replace(/[^a-zA-Z0-9@._+-]/g, '_');
    const safeSubscriptionId = subscriptionId.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (safeEmail && safeSubscriptionId) {
      const suffix = `__${safeSubscriptionId}`;
      const maxLength = 64;
      const emailMaxLength = Math.max(maxLength - suffix.length, 1);

      return `${safeEmail.slice(0, emailMaxLength)}${suffix}`;
    }

    const fallback = (safeEmail || safeSubscriptionId).slice(0, 64);
    return fallback || uuid();
  }

  private buildSubscriptionLink(node: VpnNodeConfig, subId: string): string {
    const base = node.subscriptionBaseUrl?.trim();
    if (base) {
      return this.url({ ...node, host: base }, subId);
    }

    return this.url(node, `${this.subscriptionPath()}/${subId}`);
  }

  private ensureInboundId(node: VpnNodeConfig): void {
    if (node.inboundId === undefined || node.inboundId === null) {
      throw new Error(`3x-ui node ${node.id} must have inboundId configured`);
    }
  }

  private url(node: VpnNodeConfig, path: string): string {
    const base = node.host.endsWith('/') ? node.host : `${node.host}/`;
    return new URL(path.replace(/^\/+/, ''), base).toString();
  }

  private loginPath(): string {
    return this.pathFromEnv('VPN_3XUI_LOGIN_PATH', 'login');
  }

  private inboundsPath(path: string): string {
    return `${this.pathFromEnv('VPN_3XUI_INBOUNDS_PATH', 'panel/api/inbounds')}${path}`;
  }

  private subscriptionPath(): string {
    return this.pathFromEnv('VPN_3XUI_SUB_PATH', 'sub');
  }

  private pathFromEnv(key: string, fallback: string): string {
    return (process.env[key] ?? fallback).replace(/^\/+|\/+$/g, '');
  }

  private timeout(): number {
    return Number(process.env.VPN_TIMEOUT ?? 5000);
  }

  private httpsAgent(): HttpsAgent | undefined {
    const rejectUnauthorized = (
      process.env.VPN_3XUI_TLS_REJECT_UNAUTHORIZED ?? 'true'
    ).toLowerCase();

    return rejectUnauthorized === 'false' ? this.insecureHttpsAgent : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
