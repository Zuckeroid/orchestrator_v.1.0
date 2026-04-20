import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NoopBillingProvider } from './providers/noop-billing.provider';
import { FossbillingBillingProvider } from './providers/fossbilling-billing.provider';

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');

@Module({
  imports: [ConfigModule],
  providers: [
    NoopBillingProvider,
    FossbillingBillingProvider,
    {
      provide: BILLING_PROVIDER,
      inject: [ConfigService, NoopBillingProvider, FossbillingBillingProvider],
      useFactory: (
        configService: ConfigService,
        noopProvider: NoopBillingProvider,
        fossbillingProvider: FossbillingBillingProvider,
      ) => {
        const provider =
          configService.get<string>('BILLING_PROVIDER')?.toLowerCase() ?? 'noop';

        return provider === 'fossbilling' ? fossbillingProvider : noopProvider;
      },
    },
  ],
  exports: [BILLING_PROVIDER],
})
export class BillingModule {}
