import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { JobEntity } from './entities/job.entity';
import { PlanEntity } from './entities/plan.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';
import { ProvisionEntity } from './entities/provision.entity';
import { StorageBackendEntity } from './entities/storage-backend.entity';
import { VpnNodeEntity } from './entities/vpn-node.entity';

export const DATABASE_ENTITIES = [
  AuditLogEntity,
  JobEntity,
  PlanEntity,
  ProcessedEventEntity,
  ProvisionEntity,
  StorageBackendEntity,
  VpnNodeEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '5432')),
        username: config.get<string>('DB_USER', 'orchestrator'),
        password: config.get<string>('DB_PASS', 'orchestrator'),
        database: config.get<string>('DB_NAME', 'orchestrator'),
        entities: DATABASE_ENTITIES,
        synchronize:
          config.get<string>('DB_SYNCHRONIZE', 'true').toLowerCase() === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}

