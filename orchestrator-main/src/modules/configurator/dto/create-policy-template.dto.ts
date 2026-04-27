import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { PolicyTemplateType } from '../../../database/entities/policy-template.entity';

const POLICY_TEMPLATE_TYPES: PolicyTemplateType[] = [
  'routing',
  'automation',
  'protocol_profile',
];

export class CreatePolicyTemplateDto {
  @IsString()
  name!: string;

  @IsIn(POLICY_TEMPLATE_TYPES)
  type!: PolicyTemplateType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
