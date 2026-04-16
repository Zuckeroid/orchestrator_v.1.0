import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidWebhookError extends HttpException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        success: false,
        error: {
          code,
          message,
        },
      },
      status,
    );
  }
}
