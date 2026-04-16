import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminApiKeyGuard,
  AdminRequest,
} from '../../common/guards/admin-api-key.guard';
import { StorageBackendEntity } from '../../database/entities/storage-backend.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateStorageBackendDto } from './dto/create-storage-backend.dto';
import { UpdateStorageBackendDto } from './dto/update-storage-backend.dto';
import { StorageBackendsService } from './storage-backends.service';

@Controller('storage-backends')
@UseGuards(AdminApiKeyGuard)
export class StorageBackendsController {
  constructor(
    private readonly storageBackendsService: StorageBackendsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  async list() {
    const backends = await this.storageBackendsService.list();

    return {
      success: true,
      data: backends.map((backend) => this.serializeBackend(backend)),
    };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    const backend = await this.storageBackendsService.findById(id);

    return {
      success: true,
      data: this.serializeBackend(backend),
    };
  }

  @Post()
  async create(
    @Body() body: CreateStorageBackendDto,
    @Req() request: AdminRequest,
  ) {
    const backend = await this.storageBackendsService.create(body);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'storage_backend',
      entityId: backend.id,
      action: 'create',
      after: backend,
    });

    return {
      success: true,
      data: this.serializeBackend(backend),
    };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateStorageBackendDto,
    @Req() request: AdminRequest,
  ) {
    const before = await this.storageBackendsService.findById(id);
    const backend = await this.storageBackendsService.update(id, body);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'storage_backend',
      entityId: backend.id,
      action: 'update',
      before,
      after: backend,
    });

    return {
      success: true,
      data: this.serializeBackend(backend),
    };
  }

  @Delete(':id')
  async disable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AdminRequest,
  ) {
    const before = await this.storageBackendsService.findById(id);
    const backend = await this.storageBackendsService.disable(id);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'storage_backend',
      entityId: backend.id,
      action: 'disable',
      before,
      after: backend,
    });

    return {
      success: true,
      data: this.serializeBackend(backend),
    };
  }

  private serializeBackend(backend: StorageBackendEntity) {
    return {
      ...backend,
      apiKey: '[redacted]',
      secretKey: backend.secretKey ? '[redacted]' : null,
    };
  }
}
