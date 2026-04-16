import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageBackendEntity } from '../../database/entities/storage-backend.entity';
import { StorageBackendsController } from './storage-backends.controller';
import { StorageBackendsService } from './storage-backends.service';

@Module({
  imports: [TypeOrmModule.forFeature([StorageBackendEntity])],
  controllers: [StorageBackendsController],
  providers: [StorageBackendsService],
  exports: [StorageBackendsService],
})
export class StorageBackendsModule {}
