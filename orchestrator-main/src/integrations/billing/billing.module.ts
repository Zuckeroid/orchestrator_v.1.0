import { Module } from '@nestjs/common';
import { NoopBillingProvider } from './providers/noop-billing.provider';

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');

@Module({
  providers: [
    NoopBillingProvider,
    {
      provide: BILLING_PROVIDER,
      useExisting: NoopBillingProvider,
    },
  ],
  exports: [BILLING_PROVIDER],
})
export class BillingModule {}

