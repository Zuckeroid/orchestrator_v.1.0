import {
  DomainEndpointPurpose,
  DomainEndpointRole,
} from '../../../database/entities/domain-endpoint.entity';

export class CreateDomainEndpointDto {
  purpose?: DomainEndpointPurpose;
  role?: DomainEndpointRole;
  label?: string | null;
  url!: string;
  priority?: number;
  isActive?: boolean;
  notes?: string | null;
}
