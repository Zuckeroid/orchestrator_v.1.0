import { Module } from '@nestjs/common';
import { NoopVpnClient } from './noop-vpn.client';
import { ThreeXuiVpnClient } from './providers/three-x-ui-vpn.client';

export const VPN_CLIENT = Symbol('VPN_CLIENT');

@Module({
  providers: [
    NoopVpnClient,
    ThreeXuiVpnClient,
    {
      provide: VPN_CLIENT,
      inject: [NoopVpnClient, ThreeXuiVpnClient],
      useFactory: (
        noopVpnClient: NoopVpnClient,
        threeXuiVpnClient: ThreeXuiVpnClient,
      ) => {
        const provider = (process.env.VPN_PROVIDER ?? 'noop').toLowerCase();
        return provider === '3x-ui' || provider === 'threexui'
          ? threeXuiVpnClient
          : noopVpnClient;
      },
    },
  ],
  exports: [VPN_CLIENT],
})
export class VpnModule {}
