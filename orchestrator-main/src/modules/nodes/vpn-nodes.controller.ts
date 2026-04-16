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
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProvisionsService } from '../provisions/provisions.service';
import { CreateVpnNodeDto } from './dto/create-vpn-node.dto';
import { UpdateVpnNodeDto } from './dto/update-vpn-node.dto';
import { VpnNodesService } from './vpn-nodes.service';

@Controller('nodes/vpn')
@UseGuards(AdminApiKeyGuard)
export class VpnNodesController {
  constructor(
    private readonly vpnNodesService: VpnNodesService,
    private readonly provisionsService: ProvisionsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  async list() {
    return {
      success: true,
      data: await this.vpnNodesService.list(),
    };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.vpnNodesService.findById(id),
    };
  }

  @Post()
  async create(@Body() body: CreateVpnNodeDto, @Req() request: AdminRequest) {
    const node = await this.vpnNodesService.create(body);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'vpn_node',
      entityId: node.id,
      action: 'create',
      after: node,
    });

    return {
      success: true,
      data: node,
    };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateVpnNodeDto,
    @Req() request: AdminRequest,
  ) {
    const before = await this.vpnNodesService.findById(id);
    const node = await this.vpnNodesService.update(id, body);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'vpn_node',
      entityId: node.id,
      action: 'update',
      before,
      after: node,
    });

    return {
      success: true,
      data: node,
    };
  }

  @Delete(':id')
  async disable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AdminRequest,
  ) {
    const before = await this.vpnNodesService.findById(id);
    const node = await this.vpnNodesService.disable(id);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'vpn_node',
      entityId: node.id,
      action: 'disable',
      before,
      after: node,
    });

    return {
      success: true,
      data: node,
    };
  }

  @Get(':id/affected-provisions')
  async affectedProvisions(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.provisionsService.findAffectedByVpnNode(id),
    };
  }
}
