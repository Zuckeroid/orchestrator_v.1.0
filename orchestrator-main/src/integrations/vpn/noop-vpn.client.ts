import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  CreateVpnClientInput,
  VpnClient,
  VpnClientResult,
  VpnNodeConfig,
} from './vpn-client.interface';

@Injectable()
export class NoopVpnClient implements VpnClient {
  private readonly logger = new Logger(NoopVpnClient.name);

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

