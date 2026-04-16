import { Injectable, Logger } from '@nestjs/common';
import {
  CreateBucketAccessInput,
  S3StorageProvider,
  StorageAccessResult,
  StorageBackendConfig,
} from './s3-storage-provider.interface';

@Injectable()
export class NoopS3StorageProvider implements S3StorageProvider {
  private readonly logger = new Logger(NoopS3StorageProvider.name);

  async createBucketAccess(
    backend: StorageBackendConfig,
    input: CreateBucketAccessInput,
  ): Promise<StorageAccessResult> {
    this.logger.log(
      `Mock storage bucket created on ${backend.id}: ${input.bucket}`,
    );

    return {
      bucket: input.bucket,
      credentials: {},
    };
  }

  async freezeBucketAccess(): Promise<void> {
    this.logger.log('Mock storage bucket frozen');
  }

  async deleteBucketAccess(): Promise<void> {
    this.logger.log('Mock storage bucket deleted');
  }

  async updateQuota(): Promise<void> {
    this.logger.log('Mock storage quota updated');
  }
}

