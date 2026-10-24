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
import { AppConfigService } from '../config/app-config.service';

/**
 * Uploads are buffered in memory (up to MAX_FILE_SIZE each) while multer
 * parses them. Cap how many can be in flight at once so a burst of uploads
 * can't exhaust the process memory; extra requests get 503 + Retry-After.
 *
 * Declare it BEFORE FileInterceptor so it wraps the multipart parsing.
 */
@Injectable()
export class UploadConcurrencyInterceptor implements NestInterceptor {
  /** Uploads currently being received by this process. */
  private active = 0;

  constructor(private config: AppConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.active >= this.config.maxConcurrentUploads) {
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

    this.active += 1;
    return next.handle().pipe(
      finalize(() => {
        this.active -= 1;
      }),
    );
  }

  /** How many uploads are currently in flight (diagnostics / tests). */
  get activeUploads(): number {
    return this.active;
  }
}
