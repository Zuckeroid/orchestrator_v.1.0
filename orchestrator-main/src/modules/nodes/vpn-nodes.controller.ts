import {
  Body,
  ConflictException,
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
import { TransportProfileEntity } from '../../database/entities/transport-profile.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { VpnNodeEntity } from '../../database/entities/vpn-node.entity';
import { ProvisionsService } from '../provisions/provisions.service';
import { CreateTransportProfileDto } from './dto/create-transport-profile.dto';
import { CreateVpnNodeDto } from './dto/create-vpn-node.dto';
import { UpdateTransportProfileDto } from './dto/update-transport-profile.dto';
import { UpdateVpnNodeDto } from './dto/update-vpn-node.dto';
import { TransportProfilesService } from './transport-profiles.service';
import { VpnNodesService } from './vpn-nodes.service';

@Controller('nodes/vpn')
@UseGuards(AdminApiKeyGuard)
export class VpnNodesController {
  constructor(
    private readonly vpnNodesService: VpnNodesService,
    private readonly transportProfilesService: TransportProfilesService,
    private readonly provisionsService: ProvisionsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  async list() {
    const nodes = await this.vpnNodesService.list();

    return {
      success: true,
      data: nodes.map((node) => this.serializeNode(node)),
    };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    const node = await this.vpnNodesService.findById(id);

    return {
      success: true,
      data: this.serializeNode(node),
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
      data: this.serializeNode(node),
    };
  }

  @Get(':id/transport-profiles')
  async listTransportProfiles(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: (
        await this.transportProfilesService.list(id)
      ).map((profile) => this.serializeTransportProfile(profile)),
    };
  }

  @Post(':id/transport-profiles/sync-provider')
  async syncTransportProfilesFromProvider(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AdminRequest,
  ) {
    const result = await this.transportProfilesService.syncFromProvider(id);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'transport_profile',
      entityId: id,
      action: 'sync_provider',
      after: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        profileIds: result.profiles.map((profile) => profile.id),
      },
    });

    return {
      success: true,
      data: {
        ...result,
        profiles: result.profiles.map((profile) =>
          this.serializeTransportProfile(profile),
        ),
      },
    };
  }

  @Post(':id/transport-profiles')
  async createTransportProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateTransportProfileDto,
    @Req() request: AdminRequest,
  ) {
    const profile = await this.transportProfilesService.create(id, body);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'transport_profile',
      entityId: profile.id,
      action: 'create',
      after: profile,
    });

    return {
      success: true,
      data: this.serializeTransportProfile(profile),
    };
  }

  @Patch(':id/transport-profiles/:profileId')
  async updateTransportProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('profileId', new ParseUUIDPipe()) profileId: string,
    @Body() body: UpdateTransportProfileDto,
    @Req() request: AdminRequest,
  ) {
    const before = await this.transportProfilesService.findById(id, profileId);
    const profile = await this.transportProfilesService.update(
      id,
      profileId,
      body,
    );
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'transport_profile',
      entityId: profile.id,
      action: 'update',
      before,
      after: profile,
    });

    return {
      success: true,
      data: this.serializeTransportProfile(profile),
    };
  }

  @Delete(':id/transport-profiles/:profileId')
  async removeTransportProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('profileId', new ParseUUIDPipe()) profileId: string,
    @Req() request: AdminRequest,
  ) {
    const before = await this.transportProfilesService.findById(id, profileId);
    await this.transportProfilesService.remove(id, profileId);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'transport_profile',
      entityId: profileId,
      action: 'delete',
      before,
    });

    return {
      success: true,
      data: { id: profileId },
    };
  }

  @Post(':id/transport-profiles/:profileId/check')
  async checkTransportProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('profileId', new ParseUUIDPipe()) profileId: string,
    @Req() request: AdminRequest,
  ) {
    const result = await this.transportProfilesService.check(id, profileId);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'transport_profile',
      entityId: profileId,
      action: 'check',
      after: result,
    });

    return {
      success: true,
      data: {
        ...result,
        profile: this.serializeTransportProfile(result.profile),
      },
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
      data: this.serializeNode(node),
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
      data: this.serializeNode(node),
    };
  }

  @Delete(':id/purge')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AdminRequest,
  ) {
    const before = await this.vpnNodesService.findById(id);
    const affected = await this.provisionsService.findAffectedByVpnNode(id);
    if (affected.length > 0) {
      throw new ConflictException(
        `Cannot delete VPN node while ${affected.length} provision(s) are still linked to it`,
      );
    }

    await this.vpnNodesService.remove(id);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'vpn_node',
      entityId: id,
      action: 'delete',
      before,
    });

    return {
      success: true,
      data: { id },
    };
  }

  @Get(':id/affected-provisions')
  async affectedProvisions(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.provisionsService.findAffectedByVpnNode(id),
    };
  }

  @Post(':id/check')
  async check(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AdminRequest,
  ) {
    const result = await this.vpnNodesService.checkNode(id);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'vpn_node',
      entityId: id,
      action: 'check',
      after: result,
    });

    return {
      success: true,
      data: result,
    };
  }

  private serializeNode(node: VpnNodeEntity) {
    return {
      ...node,
      apiKey: '[redacted]',
    };
  }

  private serializeTransportProfile(profile: TransportProfileEntity) {
    return {
      ...profile,
    };
  }
}
