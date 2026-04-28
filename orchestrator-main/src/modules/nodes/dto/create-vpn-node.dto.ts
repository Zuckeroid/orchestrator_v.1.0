import { Type } from 'class-transformer';
import {
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { VpnNodeUsageScope } from '../../../database/entities/vpn-node.entity';

const VPN_NODE_USAGE_SCOPES: VpnNodeUsageScope[] = ['general', 'away'];

export class CreateVpnNodeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  vdsProvider?: string;

  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @IsOptional()
  @IsString()
  apiVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  inboundId?: number;

  @IsOptional()
  @IsString()
  subscriptionBaseUrl?: string;

  @IsOptional()
  @IsIn(VPN_NODE_USAGE_SCOPES)
  usageScope?: VpnNodeUsageScope;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;
}
