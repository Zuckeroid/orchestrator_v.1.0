import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminApiKeyGuard,
  AdminRequest,
} from '../../common/guards/admin-api-key.guard';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProvisionsService } from './provisions.service';

@Controller('provisions')
@UseGuards(AdminApiKeyGuard)
export class ProvisionsController {
  constructor(
    private readonly provisionsService: ProvisionsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('externalUserId') externalUserId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      success: true,
      data: await this.provisionsService.list({
        status,
        externalUserId,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Post('purge')
  async purgeDeleted(
    @Body() body: { olderThanDays?: number } = {},
    @Req() request: AdminRequest,
  ) {
    const olderThanDays = Number(body.olderThanDays ?? 30);
    const deleted = await this.provisionsService.purgeDeleted(olderThanDays);

    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'provision',
      action: 'purge_deleted',
      before: {
        status: 'deleted',
        olderThanDays,
      },
      after: {
        deleted,
      },
    });

    return {
      success: true,
      data: {
        deleted,
        status: 'deleted',
        olderThanDays,
      },
    };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.provisionsService.getById(id),
    };
  }
}
