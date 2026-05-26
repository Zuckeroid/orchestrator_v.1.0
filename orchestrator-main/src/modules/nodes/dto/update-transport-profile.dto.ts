import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
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
import {
  TRANSPORT_PROFILE_PROTOCOLS,
  TRANSPORT_PROFILE_SECURITY,
  TRANSPORT_PROFILE_STATUSES,
  TRANSPORT_PROFILE_TRANSPORTS,
} from './create-transport-profile.dto';

export class UpdateTransportProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  providerInboundId?: number | null;

  @IsOptional()
  @IsIn(TRANSPORT_PROFILE_PROTOCOLS)
  protocol?: TransportProfileProtocol;

  @IsOptional()
  @IsIn(TRANSPORT_PROFILE_TRANSPORTS)
  transport?: TransportProfileTransport;

  @IsOptional()
  @IsIn(TRANSPORT_PROFILE_SECURITY)
  security?: TransportProfileSecurity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

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

