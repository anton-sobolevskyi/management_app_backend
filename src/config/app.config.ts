/**
 * Single, typed view of the environment. Everything that used to read
 * `process.env.X as string` goes through here, so defaults, parsing and
 * validation live in one place.
 */
export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  /**
   * Fail-closed: only an explicit "development" / "test" (or nothing at all)
   * selects the relaxed behaviour. Any other value, e.g. a typo like "prod",
   * is treated as production so security defaults are never silently lost.
   */
  nodeEnv: NodeEnv;
  isProduction: boolean;
  jwt: {
    accessSecret: string;
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
    /**
     * Removal of stored files that no attachment row points to (left behind by
     * a failed upload cleanup or a failed purge). Destructive, so: `off`
     * (default), `dry-run` (only logs what it would delete) or `delete`.
     */
    orphanSweep: 'off' | 'dry-run' | 'delete';
    /** Files younger than this are never touched (uploads in flight). */
    orphanGraceMs: number;
  };
  db: { poolMax: number };
  swaggerEnabled: boolean;
  /**
   * Escape hatch for load tests / e2e runs. Only DISABLE_THROTTLE=true turns
   * rate limiting off (never NODE_ENV), and never in production.
   */
  throttlingDisabled: boolean;
  mail: {
    /** smtp = real delivery; console = log only (dev); memory = keep in RAM (tests) */
    transport: 'smtp' | 'console' | 'memory';
    smtpUrl?: string;
    from: string;
  };
  /** Max uploads being received at once (each is buffered in memory). */
  maxConcurrentUploads: number;
  rateLimit: { defaultPerMinute: number };
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

export function resolveNodeEnv(env: NodeJS.ProcessEnv): NodeEnv {
  const raw = env.NODE_ENV?.trim();
  if (!raw) return 'development';
  if (raw === 'development' || raw === 'test') return raw;
  return 'production';
}

export function resolveOrphanSweep(
  env: NodeJS.ProcessEnv,
): 'off' | 'dry-run' | 'delete' {
  const value = env.S3_ORPHAN_SWEEP?.trim();
  if (!value) return 'off';
  if (value === 'off' || value === 'dry-run' || value === 'delete') {
    return value;
  }
  throw new Error(
    `S3_ORPHAN_SWEEP must be one of off, dry-run, delete (got "${value}")`,
  );
}

function resolveMailTransport(
  env: NodeJS.ProcessEnv,
): 'smtp' | 'console' | 'memory' {
  const explicit = env.MAIL_TRANSPORT?.trim();
  if (explicit === 'smtp' || explicit === 'console' || explicit === 'memory') {
    return explicit;
  }
  return env.SMTP_URL?.trim() ? 'smtp' : 'console';
}

export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const accessExpiresIn = env.JWT_EXPIRES_IN?.trim() || '15m';
  const refreshExpiresIn = env.REFRESH_TOKEN_EXPIRES_IN?.trim() || '7d';
  const nodeEnv = resolveNodeEnv(env);
  const isProduction = nodeEnv === 'production';

  return {
    nodeEnv,
    isProduction,
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET ?? '',
      accessExpiresIn,
      accessExpiresInSeconds: Math.floor(
        parseDurationMs(accessExpiresIn) / 1000,
      ),
      refreshExpiresIn,
      refreshTtlMs: parseDurationMs(refreshExpiresIn),
    },
    bcryptRounds: Math.min(15, Math.max(10, toInt(env.BCRYPT_ROUNDS, 12))),
    s3: {
      region: env.AWS_REGION?.trim() || undefined,
      // An empty value (e.g. from docker compose) means "real AWS S3"
      endpoint: env.AWS_S3_ENDPOINT?.trim() || undefined,
      accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
      bucket: env.AWS_S3_BUCKET ?? '',
      orphanSweep: resolveOrphanSweep(env),
      orphanGraceMs:
        Math.max(1, toInt(env.S3_ORPHAN_GRACE_HOURS, 24)) * 3_600_000,
    },
    db: { poolMax: toInt(env.DB_POOL_MAX, 10) },
    // Off by default in production (explicit opt-in); on elsewhere.
    swaggerEnabled: isProduction
      ? env.SWAGGER_ENABLED === 'true'
      : env.SWAGGER_ENABLED !== 'false',
    throttlingDisabled: !isProduction && env.DISABLE_THROTTLE === 'true',
    mail: {
      transport: resolveMailTransport(env),
      smtpUrl: env.SMTP_URL?.trim() || undefined,
      from: env.MAIL_FROM?.trim() || 'Management App <no-reply@localhost>',
    },
    maxConcurrentUploads: toInt(env.UPLOAD_MAX_CONCURRENCY, 8),
    rateLimit: { defaultPerMinute: toInt(env.RATE_LIMIT_PER_MINUTE, 600) },
    // Housekeeping timers are noise in unit/e2e runs.
    backgroundJobsEnabled:
      nodeEnv !== 'test' && env.DISABLE_BACKGROUND_JOBS !== 'true',
  };
}
