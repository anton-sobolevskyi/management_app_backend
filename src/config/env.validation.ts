import { getAppConfig } from './app.config';

/**
 * Fail fast when required environment variables are missing.
 * Call once at bootstrap (and from ConfigModule if desired).
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  // JWT_REFRESH_SECRET is no longer used (refresh tokens are opaque random
  // strings); it may still be present in old deployments and is ignored.
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET'] as const;

  const missing = required.filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const sameSite = env.COOKIE_SAME_SITE?.trim().toLowerCase();
  if (sameSite && !['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error(
      `COOKIE_SAME_SITE must be one of lax, strict, none (got "${env.COOKIE_SAME_SITE}")`,
    );
  }

  // Throws on malformed JWT_EXPIRES_IN / REFRESH_TOKEN_EXPIRES_IN
  getAppConfig(env);

  if (env.NODE_ENV === 'production') {
    if ((env.JWT_ACCESS_SECRET ?? '').length < 32) {
      throw new Error(
        'JWT_ACCESS_SECRET must be at least 32 characters in production',
      );
    }

    // Without it CORS falls back to http://localhost:5173 *with credentials*.
    if (!env.FRONTEND_URL?.trim()) {
      throw new Error(
        'FRONTEND_URL is required in production (comma-separated list of allowed origins)',
      );
    }

    if (env.DISABLE_THROTTLE === 'true') {
      throw new Error('DISABLE_THROTTLE must not be set in production');
    }
  }

  // Soft warnings for optional production services
  if (env.NODE_ENV === 'production') {
    const recommended = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_S3_BUCKET',
      'AWS_REGION',
    ];
    const absent = recommended.filter((key) => !env[key]?.trim());
    if (absent.length > 0) {
      console.warn(
        `[config] Recommended production env vars not set: ${absent.join(', ')}`,
      );
    }
  }
}
