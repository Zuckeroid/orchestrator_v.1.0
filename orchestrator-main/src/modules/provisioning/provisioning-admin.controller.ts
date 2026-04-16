import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminApiKeyGuard,
  AdminRequest,
} from '../../common/guards/admin-api-key.guard';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProvisioningService } from './provisioning.service';

@Controller('provisions')
@UseGuards(AdminApiKeyGuard)
export class ProvisioningAdminController {
  constructor(
    private readonly provisioningService: ProvisioningService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Post(':id/delete-now')
  async deleteNow(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AdminRequest,
  ) {
    const provision = await this.provisioningService.deleteProvisionNow(id);
    await this.auditLogsService.record({
      actor: request.adminActor,
      requestId: request.requestId,
      entityType: 'provision',
      entityId: provision.id,
      action: 'delete_now',
      after: provision,
    });

    return {
      success: true,
      data: provision,
    };
  }
}
