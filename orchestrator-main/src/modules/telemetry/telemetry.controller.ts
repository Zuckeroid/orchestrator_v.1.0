import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import {
  NetworkTelemetryClassification,
  NetworkTelemetryEventType,
  NetworkTelemetryResult,
} from '../../database/entities/network-telemetry-event.entity';
import { CreateNetworkTelemetryEventDto } from './dto/create-network-telemetry-event.dto';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
@UseGuards(AdminApiKeyGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('events')
  async listEvents(
    @Query('nodeId') nodeId?: string,
    @Query('result') result?: NetworkTelemetryResult,
    @Query('classification') classification?: NetworkTelemetryClassification,
    @Query('carrierName') carrierName?: string,
    @Query('eventType') eventType?: NetworkTelemetryEventType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      success: true,
      data: await this.telemetryService.list({
        nodeId,
        result,
        classification,
        carrierName,
        eventType,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Get('summary')
  async summary(@Query('hours') hours?: string) {
    return {
      success: true,
      data: await this.telemetryService.summary(
        hours ? Number(hours) : undefined,
      ),
    };
  }

  @Post('events')
  async create(@Body() body: CreateNetworkTelemetryEventDto) {
    return {
      success: true,
      data: await this.telemetryService.record(body),
    };
  }
}
