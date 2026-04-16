import { Module } from '@nestjs/common';
import { NoopVpnClient } from './noop-vpn.client';

export const VPN_CLIENT = Symbol('VPN_CLIENT');

@Module({
  providers: [
    NoopVpnClient,
    {
      provide: VPN_CLIENT,
      useExisting: NoopVpnClient,
    },
  ],
  exports: [VPN_CLIENT],
})
export class VpnModule {}

