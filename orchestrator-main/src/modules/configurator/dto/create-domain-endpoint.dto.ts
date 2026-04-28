import {
  DomainEndpointPurpose,
  DomainEndpointRole,
} from '../../../database/entities/domain-endpoint.entity';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const DOMAIN_ENDPOINT_PURPOSES: DomainEndpointPurpose[] = ['api', 'web'];
const DOMAIN_ENDPOINT_ROLES: DomainEndpointRole[] = ['primary', 'backup'];

export class CreateDomainEndpointDto {
  @IsOptional()
  @IsIn(DOMAIN_ENDPOINT_PURPOSES)
  purpose?: DomainEndpointPurpose;

  @IsOptional()
  @IsIn(DOMAIN_ENDPOINT_ROLES)
  role?: DomainEndpointRole;

  @IsOptional()
  @IsString()
  label?: string | null;

  @IsString()
  url!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
