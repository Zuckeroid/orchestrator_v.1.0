import {
  Body,
  Controller,
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
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

@Controller('plans')
@UseGuards(AdminApiKeyGuard)
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  async list() {
    return {
      success: true,
      data: await this.plansService.list(),
    };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.plansService.getById(id),
    };
  }

  @Post()
  async create(@Body() body: CreatePlanDto, @Req() request: AdminRequest) {
    const plan = await this.plansService.create(body);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'plan',
      entityId: plan.id,
      action: 'create',
      after: plan,
    });

    return {
      success: true,
      data: plan,
    };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdatePlanDto,
    @Req() request: AdminRequest,
  ) {
    const before = await this.plansService.getById(id);
    const plan = await this.plansService.update(id, body);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'plan',
      entityId: plan.id,
      action: 'update',
      before,
      after: plan,
    });

    return {
      success: true,
      data: plan,
    };
  }
}
