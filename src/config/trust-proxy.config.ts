/**
 * Value for Express's "trust proxy" setting, from TRUST_PROXY.
 *
 * - number  → trust that many proxy hops in front of the app (recommended)
 * - "true"  → trust every hop; makes X-Forwarded-For spoofable, avoid
 * - "false" → trust none; req.ip is the direct peer
 * - other   → passed through (subnet/CIDR list such as "loopback, 10.0.0.0/8")
 *
 * Unset: 1 hop in production (one load balancer, e.g. Render), none otherwise.
 */
export function getTrustProxy(
  env: NodeJS.ProcessEnv = process.env,
): boolean | number | string {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return env.NODE_ENV === 'production' ? 1 : false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}
