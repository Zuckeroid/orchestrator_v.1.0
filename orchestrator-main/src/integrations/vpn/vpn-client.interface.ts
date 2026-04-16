export interface VpnNodeConfig {
  id: string;
  host: string;
  apiKey: string;
  apiVersion?: string;
  inboundId?: number;
}

export interface CreateVpnClientInput {
  email: string;
  externalSubscriptionId: string;
  limitIp: number;
}

export interface VpnClientResult {
  login: string;
  password?: string;
  subscriptionLink: string;
}

export interface VpnClient {
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

