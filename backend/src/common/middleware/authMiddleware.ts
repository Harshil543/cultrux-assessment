import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../errors/AppError';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';

export interface AuthPayload {
  userId: number;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      cookies?: Record<string, string>;
    }
  }
}

function extractAccessToken(req: Request): string | null {
  const fromCookie = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (fromCookie) return fromCookie;

  // Optional Bearer fallback for scripts/tests
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }

  return null;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const token = extractAccessToken(req);
  if (!token) {
    next(new UnauthorizedError('Not authenticated'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired session'));
  }
}
