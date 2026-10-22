const DEFAULT_ORIGINS = ['http://localhost:5173'];

/** Origins allowed by CORS and by TrustedOriginGuard (FRONTEND_URL, comma-separated). */
export function getAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const origins = (env.FRONTEND_URL ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_ORIGINS;
}
