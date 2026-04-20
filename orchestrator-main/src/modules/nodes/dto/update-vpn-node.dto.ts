import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { VpnNodeStatus } from '../../../database/entities/vpn-node.entity';

const VPN_NODE_STATUSES: VpnNodeStatus[] = [
  'active',
  'inactive',
  'blocked',
  'draining',
];

export class UpdateVpnNodeDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  vdsProvider?: string | null;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  apiVersion?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  inboundId?: number | null;

  @IsOptional()
  @IsString()
  subscriptionBaseUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(VPN_NODE_STATUSES)
  status?: VpnNodeStatus;

  @IsOptional()
  @IsString()
  lastError?: string | null;
}
