import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import axios from 'axios';
import { Queue } from 'bull';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectQueue('billing-events')
    private readonly billingQueue: Queue,
  ) {}

  async check() {
    const [db, redis, queue, billing] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkQueue(),
      this.checkBilling(),
    ]);

    const ok =
      db === 'ok' &&
      redis === 'ok' &&
      queue.status === 'ok' &&
      (billing.status === 'ok' || billing.status === 'disabled');

    return {
      status: ok ? 'ok' : 'degraded',
      testMode:
        (this.configService.get<string>('TEST_MODE') ?? 'false').toLowerCase() ===
        'true',
      runtime: {
        mode:
          (this.configService.get<string>('TEST_MODE') ?? 'false').toLowerCase() ===
          'true'
            ? 'test'
            : 'production',
        nodeEnv: this.configService.get<string>('NODE_ENV') ?? 'development',
        billingProvider:
          this.configService.get<string>('BILLING_PROVIDER') ?? 'noop',
        vpnProvider: this.configService.get<string>('VPN_PROVIDER') ?? 'noop',
        nodeHealthChecks: {
          enabled:
            (this.configService.get<string>('NODE_HEALTH_CHECK_ENABLED') ?? 'true').toLowerCase() ===
            'true',
          cron:
            this.configService.get<string>('NODE_HEALTH_CHECK_CRON') ??
            '*/5 * * * *',
        },
        cleanup: {
          enabled:
            (this.configService.get<string>('PROVISION_CLEANUP_ENABLED') ?? 'true').toLowerCase() ===
            'true',
          cron:
            this.configService.get<string>('PROVISION_CLEANUP_CRON') ??
            '*/15 * * * *',
          limit: Number(
            this.configService.get<string>('PROVISION_CLEANUP_LIMIT') ?? '50',
          ),
        },
        rateLimits: {
          webhook: {
            enabled:
              (this.configService.get<string>('WEBHOOK_RATE_LIMIT_ENABLED') ?? 'true').toLowerCase() ===
              'true',
            windowMs: Number(
              this.configService.get<string>('WEBHOOK_RATE_LIMIT_WINDOW_MS') ??
                '60000',
            ),
            max: Number(
              this.configService.get<string>('WEBHOOK_RATE_LIMIT_MAX') ?? '60',
            ),
          },
          adminApi: {
            enabled:
              (this.configService.get<string>('ADMIN_RATE_LIMIT_ENABLED') ?? 'true').toLowerCase() ===
              'true',
            windowMs: Number(
              this.configService.get<string>('ADMIN_RATE_LIMIT_WINDOW_MS') ??
                '60000',
            ),
            max: Number(
              this.configService.get<string>('ADMIN_RATE_LIMIT_MAX') ?? '300',
            ),
          },
        },
      },
      db,
      redis,
      queue,
      billing,
    };
  }

  private async checkDb(): Promise<'ok' | 'error'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      const client = this.billingQueue.client;
      const response = await client.ping();
      return response === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }

  private async checkQueue() {
    try {
      const counts = await this.billingQueue.getJobCounts();
      return {
        status: 'ok',
        counts,
      };
    } catch {
      return {
        status: 'error',
        counts: {},
      };
    }
  }

  private async checkBilling(): Promise<{
    status: 'ok' | 'error' | 'disabled';
    provider: string;
    url?: string;
    latencyMs?: number;
  }> {
    const provider = this.configService.get<string>('BILLING_PROVIDER') ?? 'noop';
    const baseUrl = (this.configService.get<string>('BILLING_API_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    const apiKey = this.configService.get<string>('BILLING_API_KEY') ?? '';

    if (provider !== 'fossbilling' || !baseUrl || !apiKey) {
      return {
        status: 'disabled',
        provider,
      };
    }

    const url = `${baseUrl}/api/guest/orchestrator/ping`;
    const startedAt = Date.now();

    try {
      const response = await axios.post(
        url,
        {},
        {
          headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        return {
          status: 'error',
          provider,
          url,
        };
      }

      return {
        status: 'ok',
        provider,
        url,
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return {
        status: 'error',
        provider,
        url,
      };
    }
  }
}
