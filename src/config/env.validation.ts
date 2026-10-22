import { getAppConfig } from './app.config';

/**
 * Fail fast when required environment variables are missing.
 * Call once at bootstrap (and from ConfigModule if desired).
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const required = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ] as const;

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

  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values',
    );
  }

  if (env.NODE_ENV === 'production') {
    const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter(
      (key) => (env[key] ?? '').length < 32,
    );
    if (weak.length > 0) {
      throw new Error(
        `${weak.join(', ')} must be at least 32 characters in production`,
      );
    }
  }

  // Soft warnings for optional production services
  if (env.NODE_ENV === 'production') {
    const recommended = [
      'FRONTEND_URL',
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
