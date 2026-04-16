export interface StorageBackendConfig {
  id: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  provider: 'minio' | 'garage' | 'seaweedfs' | string;
}

export interface CreateBucketAccessInput {
  email: string;
  externalSubscriptionId: string;
  bucket: string;
  quotaBytes?: number;
}

export interface StorageAccessResult {
  bucket: string;
  credentials?: Record<string, unknown>;
}

export interface S3StorageProvider {
  createBucketAccess(
    backend: StorageBackendConfig,
    input: CreateBucketAccessInput,
  ): Promise<StorageAccessResult>;
  freezeBucketAccess(backend: StorageBackendConfig, bucket: string): Promise<void>;
  deleteBucketAccess(backend: StorageBackendConfig, bucket: string): Promise<void>;
  updateQuota(
    backend: StorageBackendConfig,
    bucket: string,
    quotaBytes: number,
  ): Promise<void>;
}

