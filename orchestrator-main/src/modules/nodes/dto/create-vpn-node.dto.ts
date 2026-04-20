import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;
}
