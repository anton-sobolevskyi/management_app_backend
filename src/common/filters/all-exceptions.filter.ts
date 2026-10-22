import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const GENERIC_MESSAGE = 'Internal server error';

/** Prisma known-request error codes that map to a client-facing status. */
const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Resource already exists' },
  P2003: {
    status: HttpStatus.CONFLICT,
    message: 'Operation conflicts with related data',
  },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Resource not found' },
};

function prismaErrorCode(exception: unknown): string | undefined {
  if (
    exception instanceof Error &&
    exception.name === 'PrismaClientKnownRequestError'
  ) {
    const code = (exception as Error & { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      response.getHeader('X-Request-Id');

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    // Only HttpException messages are written for clients. Anything else
    // (driver errors, TypeErrors, Prisma internals) stays in the logs.
    let message: string | string[] = GENERIC_MESSAGE;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] })?.message ||
            exception.message;
    } else {
      const mapped = PRISMA_ERROR_MAP[prismaErrorCode(exception) ?? ''];
      if (mapped) {
        status = mapped.status;
        message = mapped.message;
      }
    }

    const logId = String(requestId ?? '-');

    if (status >= 500) {
      this.logger.error(
        `[${logId}] ${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${logId}] ${request.method} ${request.url} → ${status} ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      // Stable identifier for clients to branch on (e.g. "NOT_FOUND")
      code: HttpStatus[status] ?? 'ERROR',
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }
}
