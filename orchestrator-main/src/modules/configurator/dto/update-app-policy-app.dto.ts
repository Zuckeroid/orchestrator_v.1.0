import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAppPolicyAppDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  packageName?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  iconUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
