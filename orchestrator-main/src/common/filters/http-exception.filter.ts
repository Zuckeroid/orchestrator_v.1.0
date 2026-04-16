import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      response.status(status).json(this.toErrorBody(status, exceptionResponse));
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  }

  private toErrorBody(status: number, exceptionResponse: unknown): ErrorBody {
    if (this.isErrorBody(exceptionResponse)) {
      return exceptionResponse;
    }

    if (typeof exceptionResponse === 'string') {
      return {
        success: false,
        error: {
          code: this.statusToCode(status),
          message: exceptionResponse,
        },
      };
    }

    if (this.isRecord(exceptionResponse)) {
      return {
        success: false,
        error: {
          code: this.statusToCode(status),
          message: this.extractMessage(exceptionResponse),
          details: this.extractDetails(exceptionResponse),
        },
      };
    }

    return {
      success: false,
      error: {
        code: this.statusToCode(status),
        message: 'Request failed',
      },
    };
  }

  private extractMessage(response: Record<string, unknown>): string {
    const message = response.message;
    if (Array.isArray(message)) {
      return message.join('; ');
    }

    if (typeof message === 'string') {
      return message;
    }

    if (typeof response.error === 'string') {
      return response.error;
    }

    return 'Request failed';
  }

  private extractDetails(response: Record<string, unknown>): unknown {
    return Array.isArray(response.message) ? response.message : undefined;
  }

  private statusToCode(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
    };

    return codes[status] ?? 'HTTP_ERROR';
  }

  private isErrorBody(value: unknown): value is ErrorBody {
    return (
      this.isRecord(value) &&
      value.success === false &&
      this.isRecord(value.error) &&
      typeof value.error.code === 'string' &&
      typeof value.error.message === 'string'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
