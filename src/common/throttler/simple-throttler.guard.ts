import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { normalizeEmail } from '../utils/email';
import { RATE_LIMIT_STORE, type RateLimitStore } from './rate-limit.store';

export const THROTTLE_KEY = 'throttle';
export const SKIP_GLOBAL_THROTTLE_KEY = 'skipGlobalThrottle';

export type ThrottleLimit = { limit: number; windowMs: number };

export type ThrottleOptions = ThrottleLimit & {
  /**
   * Also limit by the `email` field of the request body. Stops credential
   * stuffing that rotates IPs but keeps hitting the same account.
   */
  perEmail?: ThrottleLimit;
};

/** Per-route rate limit: e.g. @Throttle({ limit: 10, windowMs: 60_000 }) */
export const Throttle = (options: ThrottleOptions) =>
  SetMetadata(THROTTLE_KEY, options);

/** Exempt a route (health probes) from the global default limit. */
export const SkipGlobalThrottle = () =>
  SetMetadata(SKIP_GLOBAL_THROTTLE_KEY, true);

function clientIp(req: Request): string {
  // req.ip already honours the `trust proxy` setting (see main.ts). Never read
  // X-Forwarded-For directly: its first entry is client-controlled.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

async function consume(
  store: RateLimitStore,
  key: string,
  { limit, windowMs }: ThrottleLimit,
): Promise<void> {
  const now = Date.now();
  const bucket = await store.hit(key, windowMs, now);

  if (bucket.count > limit) {
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
}

/**
 * Per-route limiter driven by @Throttle (per user when authenticated, else
 * per IP). Storage is pluggable, see rate-limit.store.ts.
 * Turned off only by DISABLE_THROTTLE=true (e2e, load tests), never by
 * NODE_ENV, and never in production (see AppConfig / validateEnv).
 */
@Injectable()
export class SimpleThrottlerGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private store: RateLimitStore,
    private config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.throttlingDisabled) {
      return true;
    }

    const options = this.reflector.getAllAndOverride<
      ThrottleOptions | undefined
    >(THROTTLE_KEY, [context.getHandler(), context.getClass()]);

    if (!options) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    // Authenticated routes are limited per user, so users behind one NAT don't
    // share a bucket; anonymous routes (login, register) are limited per IP.
    const subject = req.user?.userId ?? clientIp(req);
    const route = `${context.getClass().name}:${context.getHandler().name}`;

    await consume(this.store, `${route}:${subject}`, options);

    if (options.perEmail) {
      const body = req.body as { email?: unknown } | undefined;
      if (typeof body?.email === 'string' && body.email.length <= 320) {
        await consume(
          this.store,
          `${route}:email:${normalizeEmail(body.email)}`,
          options.perEmail,
        );
      }
    }

    return true;
  }
}

/**
 * Registered globally (APP_GUARD): a generous per-IP ceiling for every route
 * that has no stricter @Throttle of its own, so unprotected endpoints can't be
 * hammered without limit. Runs before authentication, hence per IP.
 */
@Injectable()
export class GlobalThrottlerGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private store: RateLimitStore,
    private config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.throttlingDisabled) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(
      SKIP_GLOBAL_THROTTLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();

    await consume(this.store, `global:${clientIp(req)}`, {
      limit: this.config.rateLimit.defaultPerMinute,
      windowMs: 60_000,
    });

    return true;
  }
}
