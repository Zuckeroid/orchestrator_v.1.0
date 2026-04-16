import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { Agent as HttpsAgent } from 'https';
import { v4 as uuid } from 'uuid';
import {
  CreateVpnClientInput,
  VpnClient,
  VpnClientResult,
  VpnNodeConfig,
} from '../vpn-client.interface';

interface ThreeXuiCredentials {
  username: string;
  password: string;
}

interface ThreeXuiClientSettings {
  id: string;
  email: string;
  enable: boolean;
  expiryTime: number;
  flow: string;
  limitIp: number;
  reset: number;
  subId: string;
  tgId: string;
  totalGB: number;
}

@Injectable()
export class ThreeXuiVpnClient implements VpnClient {
  private readonly logger = new Logger(ThreeXuiVpnClient.name);
  private readonly sessions = new Map<string, string>();
  private readonly insecureHttpsAgent = new HttpsAgent({
    rejectUnauthorized: false,
  });

  async createClient(
    node: VpnNodeConfig,
    input: CreateVpnClientInput,
  ): Promise<VpnClientResult> {
    this.ensureInboundId(node);

    const clientId = uuid();
    const subId = clientId;
    const client = this.buildClientSettings(clientId, subId, input, true);

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
      login: clientId,
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
    };
    const client = this.buildClientSettings(
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
    clientId: string,
    subId: string,
    input: CreateVpnClientInput,
    enable: boolean,
  ): ThreeXuiClientSettings {
    return {
      id: clientId,
      email: this.buildClientEmail(input),
      enable,
      expiryTime: Number(process.env.VPN_3XUI_CLIENT_EXPIRY_TIME ?? 0),
      flow: process.env.VPN_3XUI_CLIENT_FLOW ?? 'xtls-rprx-vision',
      limitIp: Math.max(Number(input.limitIp ?? 0), 0),
      reset: 0,
      subId,
      tgId: '',
      totalGB: Number(process.env.VPN_3XUI_CLIENT_TOTAL_GB ?? 0),
    };
  }

  private async postWithSession(
    node: VpnNodeConfig,
    path: string,
    data: Record<string, unknown>,
    retry = true,
  ): Promise<void> {
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
      await this.postWithSession(node, path, data, false);
      return;
    }

    this.assertSuccess(response, path);
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
    const raw = input.externalSubscriptionId || input.email;
    const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);

    return safe || uuid();
  }

  private buildSubscriptionLink(node: VpnNodeConfig, subId: string): string {
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
