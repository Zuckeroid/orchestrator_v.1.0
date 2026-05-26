import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  TransportProfileProtocol,
  TransportProfileSecurity,
  TransportProfileStatus,
  TransportProfileTransport,
} from '../../../database/entities/transport-profile.entity';

export const TRANSPORT_PROFILE_PROTOCOLS: TransportProfileProtocol[] = [
  'vless',
  'vmess',
  'trojan',
];

export const TRANSPORT_PROFILE_TRANSPORTS: TransportProfileTransport[] = [
  'tcp',
  'ws',
  'grpc',
  'h2',
  'http',
];

export const TRANSPORT_PROFILE_SECURITY: TransportProfileSecurity[] = [
  'none',
  'tls',
  'reality',
];

export const TRANSPORT_PROFILE_STATUSES: TransportProfileStatus[] = [
  'draft',
  'active',
  'degraded',
  'blocked',
  'disabled',
];

export class CreateTransportProfileDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  providerInboundId?: number | null;

  @IsIn(TRANSPORT_PROFILE_PROTOCOLS)
  protocol!: TransportProfileProtocol;

  @IsIn(TRANSPORT_PROFILE_TRANSPORTS)
  transport!: TransportProfileTransport;

  @IsIn(TRANSPORT_PROFILE_SECURITY)
  security!: TransportProfileSecurity;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsOptional()
  @IsString()
  sni?: string | null;

  @IsOptional()
  @IsString()
  hostHeader?: string | null;

  @IsOptional()
  @IsString()
  path?: string | null;

  @IsOptional()
  @IsString()
  serviceName?: string | null;

  @IsOptional()
  @IsString()
  alpn?: string | null;

  @IsOptional()
  @IsString()
  fingerprint?: string | null;

  @IsOptional()
  @IsString()
  flow?: string | null;

  @IsOptional()
  @IsString()
  publicKey?: string | null;

  @IsOptional()
  @IsString()
  shortId?: string | null;

  @IsOptional()
  @IsString()
  spiderX?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsIn(TRANSPORT_PROFILE_STATUSES)
  status?: TransportProfileStatus;

  @IsOptional()
  @IsString()
  lastError?: string | null;

  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, unknown> | null;
}
