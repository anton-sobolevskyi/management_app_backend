import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, finalize } from 'rxjs';
import { getAppConfig } from '../config/app.config';

let active = 0;

/**
 * Uploads are buffered in memory (up to MAX_FILE_SIZE each) while multer
 * parses them. Cap how many can be in flight at once so a burst of uploads
 * can't exhaust the process memory; extra requests get 503 + Retry-After.
 *
 * Declare it BEFORE FileInterceptor so it wraps the multipart parsing.
 */
@Injectable()
export class UploadConcurrencyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { maxConcurrentUploads } = getAppConfig();

    if (active >= maxConcurrentUploads) {
      const retryAfter = 2;
      context
        .switchToHttp()
        .getResponse<Response>()
        ?.setHeader?.('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Too many uploads in progress, retry shortly',
          retryAfter,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    active += 1;
    return next.handle().pipe(
      finalize(() => {
        active -= 1;
      }),
    );
  }
}

/** Test helper: how many uploads are currently in flight. */
export function activeUploads(): number {
  return active;
}
