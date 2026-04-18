import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  CreateVpnClientInput,
  VpnClient,
  VpnClientResult,
  VpnNodeConfig,
  VpnNodeCheckResult,
} from './vpn-client.interface';

@Injectable()
export class NoopVpnClient implements VpnClient {
  private readonly logger = new Logger(NoopVpnClient.name);

  async checkNode(node: VpnNodeConfig): Promise<VpnNodeCheckResult> {
    this.logger.log(`Mock VPN node checked: ${node.id}`);

    return {
      ok: true,
      provider: 'noop',
      inboundId: node.inboundId,
      inboundFound: node.inboundId !== undefined && node.inboundId !== null,
      message: 'Noop VPN provider is configured; no remote panel was checked.',
    };
  }

  async createClient(
    node: VpnNodeConfig,
    input: CreateVpnClientInput,
  ): Promise<VpnClientResult> {
    const clientId = uuid();

    this.logger.log(
      `Mock VPN client created on ${node.id} for ${input.externalSubscriptionId}`,
    );

    return {
      login: clientId,
      password: undefined,
      subscriptionLink: `${node.host}/sub/${clientId}`,
    };
  }

  async updateClient(): Promise<void> {
    this.logger.log('Mock VPN client updated');
  }

  async deleteClient(): Promise<void> {
    this.logger.log('Mock VPN client deleted');
  }
}
