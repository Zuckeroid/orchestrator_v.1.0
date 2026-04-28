import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Not, Repository } from 'typeorm';
import {
  DomainEndpointEntity,
  DomainEndpointPurpose,
  DomainEndpointRole,
} from '../../database/entities/domain-endpoint.entity';

@Injectable()
export class DomainEndpointsService {
  constructor(
    @InjectRepository(DomainEndpointEntity)
    private readonly domainEndpointsRepository: Repository<DomainEndpointEntity>,
  ) {}

  async listDomainEndpoints(): Promise<DomainEndpointSummary[]> {
    const endpoints = await this.domainEndpointsRepository.find({
      order: {
        purpose: 'ASC',
        priority: 'ASC',
        role: 'ASC',
        url: 'ASC',
      },
    });

    return endpoints.map((endpoint) => this.mapDomainEndpoint(endpoint));
  }

  async createDomainEndpoint(
    input: CreateDomainEndpointInput,
  ): Promise<DomainEndpointSummary> {
    const purpose = this.normalizePurpose(input.purpose);
    const url = this.normalizeUrl(input.url);
    await this.ensureUrlAvailable(purpose, url);

    const endpoint = this.domainEndpointsRepository.create({
      purpose,
      role: this.normalizeRole(input.role),
      label: this.normalizeOptional(input.label),
      url,
      priority: this.normalizePriority(input.priority),
      isActive: input.isActive ?? true,
      notes: this.normalizeOptional(input.notes),
    });

    return this.mapDomainEndpoint(
      await this.domainEndpointsRepository.save(endpoint),
    );
  }

  async updateDomainEndpoint(
    id: string,
    input: UpdateDomainEndpointInput,
  ): Promise<DomainEndpointSummary> {
    const endpoint = await this.getExistingDomainEndpoint(id);
    const nextPurpose =
      input.purpose !== undefined
        ? this.normalizePurpose(input.purpose)
        : endpoint.purpose;
    const nextUrl =
      input.url !== undefined ? this.normalizeUrl(input.url) : endpoint.url;

    if (nextPurpose !== endpoint.purpose || nextUrl !== endpoint.url) {
      await this.ensureUrlAvailable(nextPurpose, nextUrl, id);
      endpoint.purpose = nextPurpose;
      endpoint.url = nextUrl;
    }

    if (input.role !== undefined) {
      endpoint.role = this.normalizeRole(input.role);
    }
    if (input.label !== undefined) {
      endpoint.label = this.normalizeOptional(input.label);
    }
    if (input.priority !== undefined) {
      endpoint.priority = this.normalizePriority(input.priority);
    }
    if (input.isActive !== undefined) {
      endpoint.isActive = input.isActive;
    }
    if (input.notes !== undefined) {
      endpoint.notes = this.normalizeOptional(input.notes);
    }

    return this.mapDomainEndpoint(
      await this.domainEndpointsRepository.save(endpoint),
    );
  }

  async deleteDomainEndpoint(id: string): Promise<void> {
    const endpoint = await this.getExistingDomainEndpoint(id);
    await this.domainEndpointsRepository.remove(endpoint);
  }

  async buildDomainBundle(): Promise<DomainBundleSnapshot> {
    const endpoints = await this.domainEndpointsRepository.find({
      where: {
        isActive: true,
      },
      order: {
        purpose: 'ASC',
        priority: 'ASC',
        role: 'ASC',
        url: 'ASC',
      },
    });
    const normalized = endpoints.map((endpoint) => ({
      purpose: endpoint.purpose,
      role: endpoint.role,
      label: endpoint.label ?? null,
      url: endpoint.url,
      priority: endpoint.priority,
    }));
    const revision = createHash('sha1')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .slice(0, 12);

    return {
      version: 1,
      revision,
      generatedAt: new Date().toISOString(),
      api: normalized
        .filter((endpoint) => endpoint.purpose === 'api')
        .map((endpoint) => this.mapBundleEndpoint(endpoint)),
      web: normalized
        .filter((endpoint) => endpoint.purpose === 'web')
        .map((endpoint) => this.mapBundleEndpoint(endpoint)),
    };
  }

  private mapBundleEndpoint(endpoint: {
    role: DomainEndpointRole;
    label: string | null;
    url: string;
    priority: number;
  }): DomainBundleEndpoint {
    return {
      role: endpoint.role,
      label: endpoint.label,
      url: endpoint.url,
      priority: endpoint.priority,
      enabled: true,
    };
  }

  private async ensureUrlAvailable(
    purpose: DomainEndpointPurpose,
    url: string,
    currentId?: string,
  ): Promise<void> {
    const existing = await this.domainEndpointsRepository.findOne({
      where: {
        purpose,
        url,
        ...(currentId ? { id: Not(currentId) } : {}),
      },
    });

    if (existing) {
      throw new ConflictException(`Domain endpoint already exists: ${purpose} ${url}`);
    }
  }

  private async getExistingDomainEndpoint(id: string): Promise<DomainEndpointEntity> {
    const endpoint = await this.domainEndpointsRepository.findOneBy({ id });
    if (!endpoint) {
      throw new NotFoundException(`Domain endpoint not found: ${id}`);
    }

    return endpoint;
  }

  private normalizePurpose(
    value: DomainEndpointPurpose | string | null | undefined,
  ): DomainEndpointPurpose {
    const normalized = String(value ?? 'api').trim().toLowerCase();
    if (normalized === 'api' || normalized === 'web') {
      return normalized;
    }

    throw new BadRequestException('Domain purpose must be api or web');
  }

  private normalizeRole(
    value: DomainEndpointRole | string | null | undefined,
  ): DomainEndpointRole {
    const normalized = String(value ?? 'backup').trim().toLowerCase();
    if (normalized === 'primary' || normalized === 'backup') {
      return normalized;
    }

    throw new BadRequestException('Domain role must be primary or backup');
  }

  private normalizeUrl(value: string): string {
    const normalized = this.normalizeOptional(value);
    if (!normalized) {
      throw new BadRequestException('Domain URL is required');
    }

    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new BadRequestException('Domain URL must be a valid URL');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('Domain URL must use http or https');
    }

    return parsed.toString().replace(/\/+$/, '');
  }

  private normalizePriority(value: number | string | null | undefined): number {
    const priority = Number(value ?? 100);
    if (!Number.isFinite(priority)) {
      throw new BadRequestException('Domain priority must be a number');
    }

    return Math.max(0, Math.min(Math.trunc(priority), 100000));
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim();

    return normalized.length > 0 ? normalized : null;
  }

  private mapDomainEndpoint(
    endpoint: DomainEndpointEntity,
  ): DomainEndpointSummary {
    return {
      id: endpoint.id,
      purpose: endpoint.purpose,
      role: endpoint.role,
      label: endpoint.label ?? null,
      url: endpoint.url,
      priority: endpoint.priority,
      isActive: endpoint.isActive,
      notes: endpoint.notes ?? null,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString(),
    };
  }
}

export interface CreateDomainEndpointInput {
  purpose?: DomainEndpointPurpose | string;
  role?: DomainEndpointRole | string;
  label?: string | null;
  url: string;
  priority?: number | string;
  isActive?: boolean;
  notes?: string | null;
}

export interface UpdateDomainEndpointInput {
  purpose?: DomainEndpointPurpose | string;
  role?: DomainEndpointRole | string;
  label?: string | null;
  url?: string;
  priority?: number | string;
  isActive?: boolean;
  notes?: string | null;
}

export interface DomainEndpointSummary {
  id: string;
  purpose: DomainEndpointPurpose;
  role: DomainEndpointRole;
  label: string | null;
  url: string;
  priority: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DomainBundleEndpoint {
  role: DomainEndpointRole;
  label: string | null;
  url: string;
  priority: number;
  enabled: boolean;
}

export interface DomainBundleSnapshot {
  version: number;
  revision: string;
  generatedAt: string;
  api: DomainBundleEndpoint[];
  web: DomainBundleEndpoint[];
}
