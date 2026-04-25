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
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  AdminRequest,
  AdminApiKeyGuard,
} from '../../common/guards/admin-api-key.guard';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProcessedEventsService } from './processed-events.service';

@Controller('processed-events')
@UseGuards(AdminApiKeyGuard)
export class ProcessedEventsController {
  constructor(
    private readonly processedEventsService: ProcessedEventsService,
    private readonly auditLogsService: AuditLogsService,
    @InjectQueue('billing-events')
    private readonly billingQueue: Queue,
  ) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('externalSubscriptionId') externalSubscriptionId?: string,
    @Query('eventId') eventId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      success: true,
      data: await this.processedEventsService.list({
        status,
        externalSubscriptionId,
        eventId,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Get('by-event-id/:eventId')
  async getByEventId(@Param('eventId') eventId: string) {
    return {
      success: true,
      data: await this.processedEventsService.getByEventId(eventId),
    };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.processedEventsService.getById(id),
    };
  }

  @Post(':id/retry')
  async retry(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AdminRequest,
  ) {
    const before = await this.processedEventsService.getById(id);
    const payload = await this.processedEventsService.buildRetryPayload(id);

    await this.billingQueue.add(payload.event, payload, {
      jobId: `manual-retry:${payload.eventId}:${Date.now()}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    });
    await this.processedEventsService.markStatus(payload.eventId, 'queued');

    const after = await this.processedEventsService.getById(id);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'processed_event',
      entityId: id,
      action: 'retry',
      before,
      after,
    });

    return {
      success: true,
      data: {
        queued: true,
        eventId: payload.eventId,
      },
    };
  }

  @Post('purge')
  async purge(
    @Body()
    body: {
      status?: 'completed' | 'failed' | 'all-terminal';
      olderThanDays?: number;
    } = {},
    @Req() request: AdminRequest,
  ) {
    const status = body.status ?? 'completed';
    const olderThanDays = Number(body.olderThanDays ?? 30);
    const deleted = await this.processedEventsService.purge({
      status,
      olderThanDays,
    });

    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'processed_event',
      action: 'purge',
      before: {
        status,
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
        status,
        olderThanDays,
      },
    };
  }
}
