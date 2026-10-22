/**
 * Single, typed view of the environment. Everything that used to read
 * `process.env.X as string` goes through here, so defaults, parsing and
 * validation live in one place.
 */
export interface AppConfig {
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    accessExpiresInSeconds: number;
    refreshExpiresIn: string;
    refreshTtlMs: number;
  };
  bcryptRounds: number;
  s3: {
    region: string | undefined;
    endpoint: string | undefined;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  };
  db: { poolMax: number };
  swaggerEnabled: boolean;
  backgroundJobsEnabled: boolean;
}

const UNITS_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** "900s", "15m", "12h", "7d" → milliseconds. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use a number plus s, m, h or d (e.g. 15m, 7d).`,
    );
  }
  return Number(match[1]) * UNITS_MS[match[2]];
}

function toInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const accessExpiresIn = env.JWT_EXPIRES_IN?.trim() || '15m';
  const refreshExpiresIn = env.REFRESH_TOKEN_EXPIRES_IN?.trim() || '7d';

  return {
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET ?? '',
      refreshSecret: env.JWT_REFRESH_SECRET ?? '',
      accessExpiresIn,
      accessExpiresInSeconds: Math.floor(
        parseDurationMs(accessExpiresIn) / 1000,
      ),
      refreshExpiresIn,
      refreshTtlMs: parseDurationMs(refreshExpiresIn),
    },
    bcryptRounds: Math.min(15, Math.max(10, toInt(env.BCRYPT_ROUNDS, 12))),
    s3: {
      region: env.AWS_REGION,
      endpoint: env.AWS_S3_ENDPOINT,
      accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
      bucket: env.AWS_S3_BUCKET ?? '',
    },
    db: { poolMax: toInt(env.DB_POOL_MAX, 10) },
    swaggerEnabled: env.SWAGGER_ENABLED !== 'false',
    // Housekeeping timers are noise in unit/e2e runs.
    backgroundJobsEnabled:
      env.NODE_ENV !== 'test' && env.DISABLE_BACKGROUND_JOBS !== 'true',
  };
}
