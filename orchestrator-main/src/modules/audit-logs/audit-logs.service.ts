import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';

export interface AuditLogRecordInput {
  actor?: string | null;
  requestId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  data?: Record<string, unknown> | null;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditLogsService {
  private readonly sensitiveKeys = new Set([
    'apiKey',
    'api_key',
    'secret',
    'secretKey',
    'secret_key',
    'password',
    'vpnPassword',
    'vpn_password',
    'storageCredentialsEncrypted',
    'storage_credentials_encrypted',
    'token',
  ]);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repository: Repository<AuditLogEntity>,
  ) {}

  async list(filters: {
    entityType?: string;
    entityId?: string;
    action?: string;
    actor?: string;
    page?: number;
    limit?: number;
  }): Promise<AuditLogEntity[]> {
    const query = this.repository
      .createQueryBuilder('audit')
      .orderBy('audit.created_at', 'DESC');

    if (filters.entityType) {
      query.andWhere('audit.entity_type = :entityType', {
        entityType: filters.entityType,
      });
    }

    if (filters.entityId) {
      query.andWhere('audit.entity_id = :entityId', {
        entityId: filters.entityId,
      });
    }

    if (filters.action) {
      query.andWhere('audit.action = :action', { action: filters.action });
    }

    if (filters.actor) {
      query.andWhere('audit.actor = :actor', { actor: filters.actor });
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const page = Math.max(filters.page ?? 1, 1);

    return query
      .take(limit)
      .skip((page - 1) * limit)
      .getMany();
  }

  async getById(id: string): Promise<AuditLogEntity> {
    const auditLog = await this.repository.findOneBy({ id });
    if (!auditLog) {
      throw new NotFoundException(`Audit log not found: ${id}`);
    }

    return auditLog;
  }

  async record(input: AuditLogRecordInput): Promise<AuditLogEntity> {
    const auditLog = this.repository.create({
      actor: input.actor ?? null,
      requestId: input.requestId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      data: this.toRecord(input.data),
      before: this.toRecord(input.before),
      after: this.toRecord(input.after),
    });

    return this.repository.save(auditLog);
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = JSON.parse(JSON.stringify(value)) as unknown;
    const redacted = this.redact(normalized);

    return this.isRecord(redacted) ? redacted : { value: redacted };
  }

  private redact(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        this.sensitiveKeys.has(key) ? '[redacted]' : this.redact(item),
      ]),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
