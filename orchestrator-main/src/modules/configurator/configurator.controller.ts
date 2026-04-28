import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { CreateAppPolicyAppDto } from './dto/create-app-policy-app.dto';
import { CreateDomainEndpointDto } from './dto/create-domain-endpoint.dto';
import { CreatePolicyTemplateDto } from './dto/create-policy-template.dto';
import { UpdateAppPolicyAppDto } from './dto/update-app-policy-app.dto';
import { UpdateDomainEndpointDto } from './dto/update-domain-endpoint.dto';
import { UpdatePolicyTemplateDto } from './dto/update-policy-template.dto';
import { ConfiguratorService } from './configurator.service';
import { DomainEndpointsService } from './domain-endpoints.service';

@Controller('configurator')
@UseGuards(AdminApiKeyGuard)
export class ConfiguratorController {
  constructor(
    private readonly configuratorService: ConfiguratorService,
    private readonly domainEndpointsService: DomainEndpointsService,
  ) {}

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

  @Get('apps')
  async listApps() {
    return {
      success: true,
      data: await this.configuratorService.listPolicyApps(),
    };
  }

  @Post('apps')
  async createApp(@Body() body: CreateAppPolicyAppDto) {
    return {
      success: true,
      data: await this.configuratorService.createPolicyApp(body),
    };
  }

  @Patch('apps/:id')
  async updateApp(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAppPolicyAppDto,
  ) {
    return {
      success: true,
      data: await this.configuratorService.updatePolicyApp(id, body),
    };
  }

  @Delete('apps/:id')
  async deleteApp(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.configuratorService.deletePolicyApp(id);

    return {
      success: true,
      data: {
        id,
        deleted: true,
      },
    };
  }

  @Get('domains')
  async listDomains() {
    return {
      success: true,
      data: await this.domainEndpointsService.listDomainEndpoints(),
    };
  }

  @Post('domains')
  async createDomain(@Body() body: CreateDomainEndpointDto) {
    return {
      success: true,
      data: await this.domainEndpointsService.createDomainEndpoint(body),
    };
  }

  @Patch('domains/:id')
  async updateDomain(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDomainEndpointDto,
  ) {
    return {
      success: true,
      data: await this.domainEndpointsService.updateDomainEndpoint(id, body),
    };
  }

  @Delete('domains/:id')
  async deleteDomain(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.domainEndpointsService.deleteDomainEndpoint(id);

    return {
      success: true,
      data: {
        id,
        deleted: true,
      },
    };
  }

  @Get('policy-templates')
  async listPolicyTemplates(@Query('type') type?: string) {
    return {
      success: true,
      data: await this.configuratorService.listPolicyTemplates(
        type as 'routing' | 'automation' | 'protocol_profile' | undefined,
      ),
    };
  }

  @Post('policy-templates')
  async createPolicyTemplate(@Body() body: CreatePolicyTemplateDto) {
    return {
      success: true,
      data: await this.configuratorService.createPolicyTemplate(body),
    };
  }

  @Patch('policy-templates/:id')
  async updatePolicyTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdatePolicyTemplateDto,
  ) {
    return {
      success: true,
      data: await this.configuratorService.updatePolicyTemplate(id, body),
    };
  }

  @Delete('policy-templates/:id')
  async deletePolicyTemplate(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.configuratorService.deletePolicyTemplate(id);

    return {
      success: true,
      data: {
        id,
        deleted: true,
      },
    };
  }
}
