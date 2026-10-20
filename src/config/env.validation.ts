/**
 * Fail fast when required environment variables are missing.
 * Call once at bootstrap (and from ConfigModule if desired).
 */
export function validateEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
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
