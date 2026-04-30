import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppPolicyAppEntity } from './entities/app-policy-app.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { DeviceConfigEntity } from './entities/device-config.entity';
import { DomainEndpointEntity } from './entities/domain-endpoint.entity';
import { JobEntity } from './entities/job.entity';
import { NetworkTelemetryEventEntity } from './entities/network-telemetry-event.entity';
import { NetworkTelemetryHourlyEntity } from './entities/network-telemetry-hourly.entity';
import { PlanEntity } from './entities/plan.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';
import { ProvisionEntity } from './entities/provision.entity';
import { ProviderAccessEntity } from './entities/provider-access.entity';
import { PolicyTemplateEntity } from './entities/policy-template.entity';
import { StorageBackendEntity } from './entities/storage-backend.entity';
import { VpnNodeEntity } from './entities/vpn-node.entity';

export const DATABASE_ENTITIES = [
  AppPolicyAppEntity,
  AuditLogEntity,
  DeviceConfigEntity,
  DomainEndpointEntity,
  JobEntity,
  NetworkTelemetryEventEntity,
  NetworkTelemetryHourlyEntity,
  PlanEntity,
  PolicyTemplateEntity,
  ProcessedEventEntity,
  ProvisionEntity,
  ProviderAccessEntity,
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
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun:
          config.get<string>('DB_MIGRATIONS_RUN', 'false').toLowerCase() ===
          'true',
        synchronize:
          config.get<string>('DB_SYNCHRONIZE', 'false').toLowerCase() ===
          'true',
      }),
    }),
  ],
})
export class DatabaseModule {}
