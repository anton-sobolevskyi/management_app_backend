import type { CookieOptions } from 'express';

export const REFRESH_COOKIE_NAME = 'refreshToken';
export const REFRESH_COOKIE_PATH = '/auth';

const SAME_SITE_VALUES = ['lax', 'strict', 'none'] as const;
export type SameSite = (typeof SAME_SITE_VALUES)[number];

export function parseSameSite(raw: string | undefined): SameSite {
  const value = raw?.trim().toLowerCase();
  return SAME_SITE_VALUES.find((v) => v === value) ?? 'lax';
}

/**
 * Attributes that identify the refresh cookie. `res.clearCookie` only removes a
 * cookie when path/domain/sameSite/secure match the ones used to set it, so set
 * and clear must both build their options from this function.
 *
 * COOKIE_SAME_SITE=none is required when the frontend and API live on different
 * sites (e.g. two *.onrender.com hosts); browsers only accept it with Secure.
 */
export function getRefreshCookieOptions(
  env: NodeJS.ProcessEnv = process.env,
): CookieOptions {
  const sameSite = parseSameSite(env.COOKIE_SAME_SITE);
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    path: REFRESH_COOKIE_PATH,
  };
}
