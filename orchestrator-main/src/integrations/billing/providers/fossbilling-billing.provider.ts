import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  BillingConfigSnapshot,
  BillingProvider,
} from '../billing-provider.interface';
import { BillingEventPayload } from '../../../common/types/billing-event.type';

@Injectable()
export class FossbillingBillingProvider implements BillingProvider {
  private readonly logger = new Logger(FossbillingBillingProvider.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const baseURL = this.configService.get<string>('BILLING_API_URL') ?? '';
    this.httpClient = axios.create({
      baseURL: baseURL.replace(/\/+$/, ''),
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.getApiKey(),
      },
    });
  }

  async validateWebhook(_payload: BillingEventPayload): Promise<void> {
    return;
  }

  async updateServiceStatus(
    externalSubscriptionId: string,
    status: string,
    error?: string | null,
  ): Promise<void> {
    await this.post('/api/guest/orchestrator/update_status', {
      external_subscription_id: externalSubscriptionId,
      status,
      ...(error ? { error } : {}),
    });
  }

  async updateDeviceConfig(
    externalSubscriptionId: string,
    snapshot: BillingConfigSnapshot,
  ): Promise<void> {
    await this.post('/api/guest/orchestrator/update_device_config', {
      external_subscription_id: externalSubscriptionId,
      config_snapshot: {
        ready: snapshot.ready,
        runtime_type: snapshot.runtimeType ?? null,
        protocol: snapshot.protocol ?? null,
        config_revision: snapshot.configRevision ?? null,
        runtime_payload: snapshot.runtimePayload ?? null,
        xray_config: snapshot.runtimePayload ?? null,
        device_id: snapshot.deviceId ?? null,
        device_name: snapshot.deviceName ?? null,
        platform: snapshot.platform ?? null,
        install_id: snapshot.installId ?? null,
        node_id: snapshot.nodeId ?? null,
        node_label: snapshot.nodeLabel ?? null,
        node_country: snapshot.nodeCountry ?? null,
        node_host: snapshot.nodeHost ?? null,
        routing_policy: snapshot.routingPolicy ?? null,
        automation_policy: snapshot.automationPolicy ?? null,
        profiles: snapshot.connectionProfiles ?? null,
        telemetry_profile: snapshot.telemetryProfile ?? null,
        domain_bundle: snapshot.domainBundle ?? null,
        domains: snapshot.domainBundle ?? null,
        generated_at: snapshot.generatedAt ?? null,
      },
    });
  }

  async syncPlans(): Promise<void> {
    this.logger.log('FOSSBilling plan sync is not implemented yet');
  }

  private async post(path: string, body: Record<string, unknown>): Promise<void> {
    try {
      await this.httpClient.post(path, body);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const details =
          typeof error.response?.data === 'string'
            ? error.response.data
            : JSON.stringify(error.response?.data ?? {});
        throw new Error(
          `FOSSBilling API request failed (${path}): ${error.message}${details !== '{}' ? ` | ${details}` : ''}`,
        );
      }

      throw error;
    }
  }

  private getApiKey(): string {
    return this.configService.get<string>('BILLING_API_KEY') ?? '';
  }
}
