import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { ProvisionsService } from './provisions.service';

@Controller('provisions')
@UseGuards(AdminApiKeyGuard)
export class ProvisionsController {
  constructor(private readonly provisionsService: ProvisionsService) {}

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

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.provisionsService.getById(id),
    };
  }
}
