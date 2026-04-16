import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ProcessedEventsService } from './processed-events.service';

@Controller('processed-events')
export class ProcessedEventsController {
  constructor(private readonly processedEventsService: ProcessedEventsService) {}

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
}
