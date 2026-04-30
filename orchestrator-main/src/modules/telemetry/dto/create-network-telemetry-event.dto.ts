import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  NetworkTelemetryClassification,
  NetworkTelemetryEventType,
  NetworkTelemetryResult,
} from '../../../database/entities/network-telemetry-event.entity';

export const NETWORK_TELEMETRY_EVENT_TYPES: NetworkTelemetryEventType[] = [
  'dns_resolution',
  'node_tcp_connect',
  'vpn_handshake',
  'tunnel_http',
  'route_probe',
];

export const NETWORK_TELEMETRY_RESULTS: NetworkTelemetryResult[] = [
  'success',
  'failed',
  'timeout',
  'skipped',
];

export const NETWORK_TELEMETRY_CLASSIFICATIONS: NetworkTelemetryClassification[] =
  [
    'dns_suspected',
    'ip_or_port_suspected',
    'protocol_suspected',
    'node_exit_degraded',
    'provider_dpi_suspected',
    'client_network_changed',
    'unknown',
  ];

export class CreateNetworkTelemetryEventDto {
  @IsIn(NETWORK_TELEMETRY_EVENT_TYPES)
  eventType!: NetworkTelemetryEventType;

  @IsIn(NETWORK_TELEMETRY_RESULTS)
  result!: NetworkTelemetryResult;

  @IsOptional()
  @IsIn(NETWORK_TELEMETRY_CLASSIFICATIONS)
  classification?: NetworkTelemetryClassification;

  @IsOptional()
  @IsUUID()
  nodeId?: string;

  @IsOptional()
  @IsString()
  nodeName?: string;

  @IsOptional()
  @IsString()
  nodeCountry?: string;

  @IsOptional()
  @IsString()
  nodeHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  nodePort?: number;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsOptional()
  @IsString()
  transport?: string;

  @IsOptional()
  @IsString()
  networkType?: string;

  @IsOptional()
  @IsString()
  carrierName?: string;

  @IsOptional()
  @IsString()
  mcc?: string;

  @IsOptional()
  @IsString()
  mnc?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  installIdHash?: string;

  @IsOptional()
  @IsUUID()
  deviceConfigId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120000)
  latencyMs?: number;

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  observedAt?: string;
}
