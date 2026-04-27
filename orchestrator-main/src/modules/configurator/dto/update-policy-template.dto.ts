import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { PolicyTemplateType } from '../../../database/entities/policy-template.entity';

const POLICY_TEMPLATE_TYPES: PolicyTemplateType[] = [
  'routing',
  'automation',
  'protocol_profile',
];

export class UpdatePolicyTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(POLICY_TEMPLATE_TYPES)
  type?: PolicyTemplateType;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
