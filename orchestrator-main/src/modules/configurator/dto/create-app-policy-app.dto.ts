import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateAppPolicyAppDto {
  @IsString()
  name!: string;

  @IsString()
  packageName!: string;

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
  @IsBoolean()
  isActive?: boolean;
}
