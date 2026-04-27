import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { ConfiguratorService } from './configurator.service';

@Controller('configurator')
@UseGuards(AdminApiKeyGuard)
export class ConfiguratorController {
  constructor(private readonly configuratorService: ConfiguratorService) {}

  @Get('services')
  async listServices(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      success: true,
      data: await this.configuratorService.listServices({
        status,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Get('services/:id')
  async getService(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.configuratorService.getServiceById(id),
    };
  }

  @Post('services/:id/regenerate')
  async regenerateService(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.configuratorService.regenerateServiceConfig(id),
    };
  }

  @Get('policy-templates')
  async listPolicyTemplates() {
    return {
      success: true,
      data: await this.configuratorService.listPolicyTemplates(),
    };
  }
}
