export interface VpnNodeConfig {
  id: string;
  host: string;
  apiKey: string;
  apiVersion?: string;
  inboundId?: number;
  protocol?: string;
  clientFlow?: string;
  subscriptionBaseUrl?: string;
}

export interface CreateVpnClientInput {
  email: string;
  externalSubscriptionId: string;
  limitIp: number;
  expiresAt?: Date;
}

export interface VpnClientResult {
  login: string;
  password?: string;
  subscriptionLink: string;
}

export interface VpnNodeCheckResult {
  ok: boolean;
  provider: string;
  inboundId?: number | null;
  inboundFound?: boolean;
  clientCount?: number;
  message: string;
}

export interface VpnNodeCheckOptions {
  forceReauth?: boolean;
}

export interface VpnProviderInbound {
  id: number;
  remark?: string | null;
  protocol?: string | null;
  port?: number | null;
  enable?: boolean | null;
  settings?: Record<string, unknown> | null;
  streamSettings?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
}

export interface VpnProviderInboundInput {
  remark: string;
  protocol: string;
  port: number;
  listen?: string;
  enable: boolean;
  expiryTime?: number;
  total?: number;
  settings: Record<string, unknown>;
  streamSettings?: Record<string, unknown> | null;
  sniffing?: Record<string, unknown> | null;
}

export interface VpnClient {
  listInbounds(node: VpnNodeConfig): Promise<VpnProviderInbound[]>;
  createInbound(
    node: VpnNodeConfig,
    input: VpnProviderInboundInput,
  ): Promise<VpnProviderInbound>;
  updateInbound(
    node: VpnNodeConfig,
    inboundId: number,
    input: VpnProviderInboundInput,
  ): Promise<VpnProviderInbound>;
  checkNode(
    node: VpnNodeConfig,
    options?: VpnNodeCheckOptions,
  ): Promise<VpnNodeCheckResult>;
  createClient(
    node: VpnNodeConfig,
    input: CreateVpnClientInput,
  ): Promise<VpnClientResult>;
  updateClient(
    node: VpnNodeConfig,
    login: string,
    patch: Partial<CreateVpnClientInput> & { enable?: boolean },
  ): Promise<void>;
  deleteClient(node: VpnNodeConfig, login: string): Promise<void>;
}
