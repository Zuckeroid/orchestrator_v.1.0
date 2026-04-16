import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ProvisionsService } from '../provisions/provisions.service';
import { CreateVpnNodeDto } from './dto/create-vpn-node.dto';
import { UpdateVpnNodeDto } from './dto/update-vpn-node.dto';
import { VpnNodesService } from './vpn-nodes.service';

@Controller('nodes/vpn')
export class VpnNodesController {
  constructor(
    private readonly vpnNodesService: VpnNodesService,
    private readonly provisionsService: ProvisionsService,
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
  async create(@Body() body: CreateVpnNodeDto) {
    return {
      success: true,
      data: await this.vpnNodesService.create(body),
    };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateVpnNodeDto,
  ) {
    return {
      success: true,
      data: await this.vpnNodesService.update(id, body),
    };
  }

  @Delete(':id')
  async disable(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.vpnNodesService.disable(id),
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
