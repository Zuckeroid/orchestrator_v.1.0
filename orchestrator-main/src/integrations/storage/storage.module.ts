import { Module } from '@nestjs/common';
import { NoopS3StorageProvider } from './noop-s3-storage.provider';

export const S3_STORAGE_PROVIDER = Symbol('S3_STORAGE_PROVIDER');

@Module({
  providers: [
    NoopS3StorageProvider,
    {
      provide: S3_STORAGE_PROVIDER,
      useExisting: NoopS3StorageProvider,
    },
  ],
  exports: [S3_STORAGE_PROVIDER],
})
export class StorageModule {}

