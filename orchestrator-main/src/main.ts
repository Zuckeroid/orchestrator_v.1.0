import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { createRateLimitMiddleware } from './common/middleware/rate-limit.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.enableCors({
    origin: (process.env.ADMIN_UI_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-Admin-Api-Key',
      'X-Admin-Actor',
      'X-Request-Id',
      'x-api-key',
      'x-timestamp',
      'x-signature',
    ],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  app.use(
    '/api/v1/webhook/billing',
    createRateLimitMiddleware({
      enabled:
        (process.env.WEBHOOK_RATE_LIMIT_ENABLED ?? 'true').toLowerCase() ===
        'true',
      scope: 'webhook',
      windowMs: Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 60000),
      max: Number(process.env.WEBHOOK_RATE_LIMIT_MAX ?? 60),
      message: 'Too many webhook requests',
    }),
  );
  app.use(
    '/api/v1',
    createRateLimitMiddleware({
      enabled:
        (process.env.ADMIN_RATE_LIMIT_ENABLED ?? 'true').toLowerCase() ===
        'true',
      scope: 'admin',
      windowMs: Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS ?? 60000),
      max: Number(process.env.ADMIN_RATE_LIMIT_MAX ?? 300),
      message: 'Too many admin API requests',
      skip: (request) => {
        const path = request.originalUrl ?? '';
        return (
          path.startsWith('/api/v1/webhook/billing') ||
          path.startsWith('/api/v1/health')
        );
      },
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}
bootstrap();
