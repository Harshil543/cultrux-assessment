import { CookieOptions, Response } from 'express';
import { env } from '../../config/env';

export const ACCESS_TOKEN_COOKIE = 'cultrux_access_token';

function cookieOptions(): CookieOptions {
  const isProd = env.nodeEnv === 'production';

  return {
    httpOnly: true,
    // Secure cookies require HTTPS; keep false on local http://localhost
    secure: isProd,
    // Lax: sent on same-site requests (localhost:5173 → proxied API / or localhost:3000)
    // Use 'none' + secure:true only for true cross-site HTTPS deployments
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (align with JWT_EXPIRES_IN default)
  };
}

export function setAccessTokenCookie(res: Response, token: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, token, cookieOptions());
}

export function clearAccessTokenCookie(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    ...cookieOptions(),
    maxAge: 0,
  });
}
