import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { getAllowedOrigins } from '../../config/cors.config';

/**
 * CSRF defence for cookie-authenticated endpoints (/auth/refresh, /auth/logout).
 *
 * Browsers always send an Origin header on cross-origin and POST requests, so a
 * present-but-unknown Origin means the request was triggered by another site.
 * Requests without Origin (curl, server-to-server, mobile clients) are allowed:
 * they cannot ride on a victim's browser cookies.
 *
 * Needed once COOKIE_SAME_SITE=none, where SameSite no longer blocks the cookie.
 */
@Injectable()
export class TrustedOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin = req.headers.origin;

    if (!origin) return true;
    if (getAllowedOrigins().includes(origin.replace(/\/+$/, ''))) return true;

    // Same-origin requests (e.g. Swagger UI served by this API)
    try {
      if (new URL(origin).host === req.get('host')) return true;
    } catch {
      // malformed Origin (including the literal "null") falls through
    }

    throw new ForbiddenException('Untrusted origin');
  }
}
