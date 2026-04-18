import { Inject, Injectable, Logger } from '@nestjs/common';
import { BillingEventPayload } from '../../common/types/billing-event.type';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { StorageBackendEntity } from '../../database/entities/storage-backend.entity';
import { VpnNodeEntity } from '../../database/entities/vpn-node.entity';
import {
  BILLING_PROVIDER,
} from '../../integrations/billing/billing.module';
import { BillingProvider } from '../../integrations/billing/billing-provider.interface';
import {
  S3StorageProvider,
  StorageAccessResult,
  StorageBackendConfig,
} from '../../integrations/storage/s3-storage-provider.interface';
import { S3_STORAGE_PROVIDER } from '../../integrations/storage/storage.module';
import {
  VpnClient,
  VpnClientResult,
  VpnNodeConfig,
} from '../../integrations/vpn/vpn-client.interface';
import { VPN_CLIENT } from '../../integrations/vpn/vpn.module';
import { VpnNodesService } from '../nodes/vpn-nodes.service';
import { PlansService } from '../plans/plans.service';
import { ProvisionsService } from '../provisions/provisions.service';
import { StorageBackendsService } from '../storage-backends/storage-backends.service';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    @Inject(BILLING_PROVIDER)
    private readonly billingProvider: BillingProvider,
    @Inject(VPN_CLIENT)
    private readonly vpnClient: VpnClient,
    @Inject(S3_STORAGE_PROVIDER)
    private readonly storageProvider: S3StorageProvider,
    private readonly plansService: PlansService,
    private readonly provisionsService: ProvisionsService,
    private readonly vpnNodesService: VpnNodesService,
    private readonly storageBackendsService: StorageBackendsService,
  ) {}

  async handleBillingEvent(event: BillingEventPayload): Promise<void> {
    switch (event.event) {
      case 'payment_paid':
        await this.provisionOrRenew(event);
        return;
      case 'subscription_cancel':
        await this.suspend(event, 'cancelled');
        return;
      case 'subscription_expired':
        await this.suspend(event, 'suspended');
        return;
      case 'plan_changed':
        await this.updatePlan(event);
        return;
      default:
        this.assertNever(event.event);
    }
  }

  async deleteProvisionNow(provisionId: string): Promise<ProvisionEntity> {
    const provision = await this.provisionsService.getById(provisionId);
    await this.deleteProvisionResources(provision);

    return this.provisionsService.getById(provisionId);
  }

  async cleanupDueProvisions(limit = 50): Promise<{
    deleted: number;
    failed: number;
    deletedIds: string[];
    failedIds: string[];
  }> {
    const provisions = await this.provisionsService.findDueForDeletion(limit);
    const deletedIds: string[] = [];
    const failedIds: string[] = [];

    for (const provision of provisions) {
      try {
        await this.deleteProvisionResources(provision);
        deletedIds.push(provision.id);
      } catch (error) {
        failedIds.push(provision.id);
        await this.provisionsService.updateStatus(provision, provision.status, {
          error: error instanceof Error ? error.message : String(error),
        });
        this.logger.error(
          `Failed to cleanup provision ${provision.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      deleted: deletedIds.length,
      failed: failedIds.length,
      deletedIds,
      failedIds,
    };
  }

  private async provisionOrRenew(event: BillingEventPayload): Promise<void> {
    this.ensurePaid(event);

    const provision = await this.provisionsService.getOrCreateFromEvent(event);
    const plan = await this.plansService.resolveByExternalPlanId(
      event.externalPlanId,
    );

    this.logger.log(
      `Provisioning subscription ${event.externalSubscriptionId} for ${event.email}`,
    );

    await this.provisionsService.markProvisioning(provision);
    const serviceExpiresAt =
      this.parseServiceExpiresAt(event) ?? provision.serviceExpiresAt ?? undefined;

    let newVpnNode: VpnNodeEntity | undefined;
    let vpn: VpnClientResult | undefined;
    let vpnLoadIncremented = false;
    let newStorageBackend: StorageBackendEntity | undefined;
    let storage: StorageAccessResult | undefined;
    let storageLoadIncremented = false;

    try {
      if (plan.vpnEnabled) {
        const vpnNode = provision.vpnNodeId
          ? await this.vpnNodesService.findById(provision.vpnNodeId)
          : await this.vpnNodesService.selectLeastLoaded();
        newVpnNode = provision.vpnNodeId ? undefined : vpnNode;

        const nodeConfig = this.toVpnNodeConfig(vpnNode);
        if (provision.vpnLogin && provision.subscriptionLink) {
          await this.vpnClient.updateClient(nodeConfig, provision.vpnLogin, {
            email: event.email,
            externalSubscriptionId: event.externalSubscriptionId,
            limitIp: plan.maxDevices,
            expiresAt: serviceExpiresAt,
            enable: true,
          });
          vpn = {
            login: provision.vpnLogin,
            password: provision.vpnPassword ?? undefined,
            subscriptionLink: provision.subscriptionLink,
          };
        } else {
          vpn = await this.vpnClient.createClient(nodeConfig, {
            email: event.email,
            externalSubscriptionId: event.externalSubscriptionId,
            limitIp: plan.maxDevices,
            expiresAt: serviceExpiresAt,
          });
        }

        if (newVpnNode && !provision.vpnLogin) {
          const loadIncremented = await this.vpnNodesService.incrementLoad(
            newVpnNode.id,
          );
          if (!loadIncremented) {
            await this.vpnClient.deleteClient(nodeConfig, vpn.login);
            throw new Error('VPN node capacity was exhausted concurrently');
          }
          vpnLoadIncremented = true;
        }
      }

      if (plan.storageEnabled) {
        const storageBackend = provision.storageBackendId
          ? await this.storageBackendsService.findById(
              provision.storageBackendId,
            )
          : await this.storageBackendsService.selectLeastLoaded();
        newStorageBackend = provision.storageBackendId
          ? undefined
          : storageBackend;

        const backendConfig = this.toStorageBackendConfig(storageBackend);
        if (provision.storageBucket) {
          await this.storageProvider.updateQuota(
            backendConfig,
            provision.storageBucket,
            plan.storageSizeBytes,
          );
          storage = {
            bucket: provision.storageBucket,
            credentials: provision.storageCredentialsEncrypted ?? undefined,
          };
        } else {
          storage = await this.storageProvider.createBucketAccess(
            backendConfig,
            {
              email: event.email,
              externalSubscriptionId: event.externalSubscriptionId,
              bucket: this.buildBucketName(event.externalSubscriptionId),
              quotaBytes: plan.storageSizeBytes,
            },
          );
        }

        if (newStorageBackend && !provision.storageBucket) {
          const loadIncremented =
            await this.storageBackendsService.incrementLoad(
              newStorageBackend.id,
            );
          if (!loadIncremented) {
            await this.storageProvider.deleteBucketAccess(
              backendConfig,
              storage.bucket,
            );
            throw new Error(
              'Storage backend capacity was exhausted concurrently',
            );
          }
          storageLoadIncremented = true;
        }
      }

      await this.provisionsService.markActive(provision, {
        planId: plan.planId,
        lastExternalPaymentId: event.externalPaymentId,
        serviceExpiresAt,
        vpnNodeId: provision.vpnNodeId ?? newVpnNode?.id ?? null,
        vpnLogin: vpn?.login ?? provision.vpnLogin ?? null,
        vpnPassword: vpn?.password ?? provision.vpnPassword ?? null,
        subscriptionLink:
          vpn?.subscriptionLink ?? provision.subscriptionLink ?? null,
        storageBackendId:
          provision.storageBackendId ?? newStorageBackend?.id ?? null,
        storageBucket: storage?.bucket ?? provision.storageBucket ?? null,
        storageCredentialsEncrypted:
          storage?.credentials ?? provision.storageCredentialsEncrypted ?? null,
      });

      this.logger.log(
        `Provisioned ${event.externalSubscriptionId}: vpn=${vpn?.login ?? 'disabled'}, bucket=${storage?.bucket ?? 'disabled'}`,
      );

      if (vpn?.subscriptionLink) {
        await this.billingProvider.updateSubscriptionLink(
          event.externalSubscriptionId,
          vpn.subscriptionLink,
        );
      }
      await this.billingProvider.updateServiceStatus(
        event.externalSubscriptionId,
        'active',
      );
    } catch (error) {
      if (newVpnNode && vpnLoadIncremented) {
        await this.vpnNodesService.decrementLoad(newVpnNode.id);
      }
      if (newStorageBackend && storageLoadIncremented) {
        await this.storageBackendsService.decrementLoad(newStorageBackend.id);
      }

      await this.provisionsService.markFailed(
        provision,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async suspend(
    event: BillingEventPayload,
    status: 'cancelled' | 'suspended',
  ): Promise<void> {
    const provision = await this.provisionsService.findByExternalSubscriptionId(
      event.externalSubscriptionId,
    );
    if (!provision) {
      this.logger.warn(
        `Cannot suspend missing provision: ${event.externalSubscriptionId}`,
      );
      return;
    }

    const deleteAfter = new Date();
    deleteAfter.setDate(deleteAfter.getDate() + 30);

    this.logger.log(
      `Suspending subscription ${event.externalSubscriptionId}: ${status}`,
    );

    await this.provisionsService.updateStatus(provision, status, {
      storageStatus: provision.storageBucket ? 'frozen' : provision.storageStatus,
      deleteAfter,
      suspendedAt: new Date(),
    });

    const shouldReleaseCapacity = provision.status === 'active';

    if (provision.vpnNodeId && provision.vpnLogin) {
      const vpnNode = await this.vpnNodesService.findById(provision.vpnNodeId);
      await this.vpnClient.updateClient(
        this.toVpnNodeConfig(vpnNode),
        provision.vpnLogin,
        {
          email: provision.email,
          externalSubscriptionId: provision.externalSubscriptionId,
          limitIp: 0,
          enable: false,
        },
      );
    }

    if (shouldReleaseCapacity && provision.vpnNodeId) {
      await this.vpnNodesService.decrementLoad(provision.vpnNodeId);
    }
    if (shouldReleaseCapacity && provision.storageBackendId) {
      await this.storageBackendsService.decrementLoad(
        provision.storageBackendId,
      );
    }

    await this.billingProvider.updateServiceStatus(
      event.externalSubscriptionId,
      status,
    );
  }

  private async deleteProvisionResources(
    provision: ProvisionEntity,
  ): Promise<void> {
    if (provision.status === 'deleted') {
      return;
    }

    this.logger.log(
      `Deleting resources for provision ${provision.id}: ${provision.externalSubscriptionId}`,
    );

    const shouldReleaseCapacity = provision.status === 'active';

    if (provision.vpnNodeId && provision.vpnLogin) {
      const vpnNode = await this.vpnNodesService.findById(provision.vpnNodeId);
      await this.vpnClient.deleteClient(
        this.toVpnNodeConfig(vpnNode),
        provision.vpnLogin,
      );
    }

    if (provision.storageBackendId && provision.storageBucket) {
      const storageBackend = await this.storageBackendsService.findById(
        provision.storageBackendId,
      );
      await this.storageProvider.deleteBucketAccess(
        this.toStorageBackendConfig(storageBackend),
        provision.storageBucket,
      );
    }

    if (shouldReleaseCapacity && provision.vpnNodeId) {
      await this.vpnNodesService.decrementLoad(provision.vpnNodeId);
    }
    if (shouldReleaseCapacity && provision.storageBackendId) {
      await this.storageBackendsService.decrementLoad(
        provision.storageBackendId,
      );
    }

    await this.provisionsService.updateStatus(provision, 'deleted', {
      storageStatus: provision.storageBucket ? 'deleted' : provision.storageStatus,
      deletedAt: new Date(),
      error: null,
    });
  }

  private async updatePlan(event: BillingEventPayload): Promise<void> {
    const provision = await this.provisionsService.findByExternalSubscriptionId(
      event.externalSubscriptionId,
    );
    if (!provision) {
      throw new Error(
        `Cannot update plan for missing provision: ${event.externalSubscriptionId}`,
      );
    }

    const plan = await this.plansService.resolveByExternalPlanId(
      event.externalPlanId,
    );

    this.logger.log(
      `Updating plan for ${event.externalSubscriptionId}: limitIp=${plan.maxDevices}, storage=${plan.storageSizeBytes}`,
    );

    await this.provisionsService.updatePlan(provision, plan.planId);

    if (provision.vpnNodeId && provision.vpnLogin) {
      const vpnNode = await this.vpnNodesService.findById(provision.vpnNodeId);
      await this.vpnClient.updateClient(
        this.toVpnNodeConfig(vpnNode),
        provision.vpnLogin,
        {
          email: event.email || provision.email,
          externalSubscriptionId: event.externalSubscriptionId,
          limitIp: plan.maxDevices,
          expiresAt:
            this.parseServiceExpiresAt(event) ??
            provision.serviceExpiresAt ??
            undefined,
          enable: plan.vpnEnabled,
        },
      );
    }

    if (plan.storageEnabled && provision.storageBackendId && provision.storageBucket) {
      const storageBackend = await this.storageBackendsService.findById(
        provision.storageBackendId,
      );
      await this.storageProvider.updateQuota(
        this.toStorageBackendConfig(storageBackend),
        provision.storageBucket,
        plan.storageSizeBytes,
      );
    }

    await this.billingProvider.updateServiceStatus(
      event.externalSubscriptionId,
      'active',
    );
  }

  private toVpnNodeConfig(node: VpnNodeEntity): VpnNodeConfig {
    return {
      id: node.id,
      host: node.host,
      apiKey: node.apiKey,
      apiVersion: node.apiVersion ?? undefined,
      inboundId: node.inboundId ?? undefined,
      subscriptionBaseUrl: node.subscriptionBaseUrl ?? undefined,
    };
  }

  private parseServiceExpiresAt(event: BillingEventPayload): Date | undefined {
    if (!event.expiresAt) {
      return undefined;
    }

    const expiresAt = new Date(event.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return undefined;
    }

    return expiresAt;
  }

  private toStorageBackendConfig(
    backend: StorageBackendEntity,
  ): StorageBackendConfig {
    return {
      id: backend.id,
      endpoint: backend.endpoint,
      accessKey: backend.apiKey,
      secretKey: backend.secretKey ?? '',
      region: backend.region ?? undefined,
      provider: backend.provider,
    };
  }

  private ensurePaid(event: BillingEventPayload): void {
    if (event.status !== 'paid') {
      throw new Error(`payment_paid event has invalid status: ${event.status}`);
    }
  }

  private buildBucketName(externalSubscriptionId: string): string {
    return `sub-${externalSubscriptionId}`.toLowerCase();
  }

  private assertNever(value: never): never {
    throw new Error(`Unsupported billing event: ${value}`);
  }
}
