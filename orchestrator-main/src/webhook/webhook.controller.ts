import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { WebhookService } from './webhook.service';

@Controller('webhook')
export class WebhookController {
  constructor(private service: WebhookService) {}

  @Post('billing')
  handle(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: { rawBody?: Buffer },
  ) {
    return this.service.handle(body, headers, request.rawBody);
  }

  @Post('billing/preflight')
  handlePreflight(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: { rawBody?: Buffer },
  ) {
    return this.service.handlePreflight(body, headers, request.rawBody);
  }

  @Post('billing/telemetry')
  handleTelemetry(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: { rawBody?: Buffer },
  ) {
    return this.service.handleTelemetry(body, headers, request.rawBody);
  }

  @Post('billing/test')
  @UseGuards(AdminApiKeyGuard)
  handleTest(@Body() body: unknown) {
    return this.service.handleTrusted(body);
  }
}
