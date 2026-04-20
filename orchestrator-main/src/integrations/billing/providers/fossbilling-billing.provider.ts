import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { BillingProvider } from '../billing-provider.interface';
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

  async updateSubscriptionLink(
    externalSubscriptionId: string,
    subscriptionLink: string,
  ): Promise<void> {
    await this.post('/api/guest/orchestrator/update_subscription', {
      external_subscription_id: externalSubscriptionId,
      subscription_link: subscriptionLink,
    });
  }

  async syncPlans(): Promise<void> {
    this.logger.log('FOSSBilling plan sync is not implemented yet');
  }

  private async post(path: string, body: Record<string, string>): Promise<void> {
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
