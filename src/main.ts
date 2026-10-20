import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { validateEnv } from './config/env.validation';
import { generateRequestId } from './common/utils/token-hash';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=15552000; includeSubDomains',
      );
    }
    next();
  });

  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : generateRequestId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  const frontendUrl = process.env.FRONTEND_URL;
  const corsOrigins = frontendUrl
    ? frontendUrl.split(',').map((o) => o.trim())
    : ['http://localhost:5173'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('API')
    .setDescription('Project management API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      controllerKey.toLocaleLowerCase().replace('controller', '') +
      `-${methodKey.toLocaleLowerCase()}`,
  });
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
