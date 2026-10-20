import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const THROTTLE_KEY = 'throttle';

export type ThrottleOptions = { limit: number; windowMs: number };

/** Per-route rate limit: e.g. @Throttle({ limit: 10, windowMs: 60_000 }) */
export const Throttle = (options: ThrottleOptions) =>
  SetMetadata(THROTTLE_KEY, options);

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Lightweight in-memory IP rate limiter (no extra dependency).
 * Suitable for a single instance; use Redis-backed throttling at scale.
 */
@Injectable()
export class SimpleThrottlerGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(
      THROTTLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    const key = `${context.getClass().name}:${context.getHandler().name}:${ip}`;
    const now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > options.limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Occasional cleanup of expired buckets
    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) {
        if (now >= b.resetAt) this.buckets.delete(k);
      }
    }

    return true;
  }
}
