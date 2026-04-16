import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsIntegerLike } from '../../../common/validators/is-integer-like.validator';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  externalPlanId!: string;

  @IsOptional()
  @IsString()
  billingProvider?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsBoolean()
  vpnEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  storageEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDevices?: number | null;

  @IsOptional()
  @IsIntegerLike()
  storageSize?: number | string | null;
}
