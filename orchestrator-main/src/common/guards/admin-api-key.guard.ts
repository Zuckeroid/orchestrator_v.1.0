import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export interface AdminRequest {
  headers: Record<string, string | string[] | undefined>;
  adminActor?: string;
  requestId?: string;
}

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const configuredKey = process.env.ADMIN_API_KEY;

    if (!configuredKey) {
      throw new ServiceUnavailableException('Admin API key is not configured');
    }

    const apiKey = this.getHeader(request, 'x-admin-api-key');
    if (!apiKey) {
      throw new UnauthorizedException('Admin API key is required');
    }

    if (apiKey !== configuredKey) {
      throw new ForbiddenException('Invalid admin API key');
    }

    request.adminActor = this.getHeader(request, 'x-admin-actor') ?? 'admin';
    request.requestId = this.getHeader(request, 'x-request-id');

    return true;
  }

  private getHeader(request: AdminRequest, name: string): string | undefined {
    const value = request.headers[name];
    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }
}
