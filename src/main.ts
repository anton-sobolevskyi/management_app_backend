import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { validateEnv } from './config/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { getAllowedOrigins } from './config/cors.config';
import { getTrustProxy } from './config/trust-proxy.config';
import { getAppConfig } from './config/app.config';

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Makes req.ip honour only the configured number of proxy hops, so a client
  // cannot spoof its address (and dodge rate limits) via X-Forwarded-For.
  app.set('trust proxy', getTrustProxy());

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  // Close the Prisma pool and finish in-flight requests on SIGTERM/SIGINT
  app.enableShutdownHooks();

  app.use((_req: Request, res: Response, next: NextFunction) => {
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

  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  if (getAppConfig().swaggerEnabled) {
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
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
