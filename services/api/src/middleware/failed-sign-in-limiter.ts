import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import prisma from '../utils/db';
import { FailedSignInLimiter, FailureStore } from '../utils/failed-sign-in-limit';

/** Failure counters live in the existing RateLimit table (key, count, lastRequest = last failure). */
export const rateLimitFailureStore: FailureStore = {
  async get(key) {
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    return row ? { count: row.count, lastFailure: Number(row.lastRequest) } : null;
  },
  async recordFailure(key, now, windowMs) {
    // One statement, atomic per key: reset to 1 when the previous window ended, else add 1.
    await prisma.$executeRaw`
      INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
      VALUES (${crypto.randomUUID()}, ${key}, 1, ${BigInt(now)})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN ${BigInt(now)} - "RateLimit"."lastRequest" > ${BigInt(windowMs)} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "lastRequest" = ${BigInt(now)}`;
  },
};

const limiter = new FailedSignInLimiter(rateLimitFailureStore, 5, 15 * 60 * 1000);

/** Same client identity the previous sign-in limit used: Traefik's X-Real-Ip, else the connection address. */
export function clientIp(req: Request): string {
  const header = req.headers['x-real-ip'];
  const value = Array.isArray(header) ? header[0] : header;
  return (value && value.trim()) || req.ip || req.socket.remoteAddress || 'unknown';
}

export function failedSignInKey(ip: string): string {
  return `failed-sign-in:${ip}`;
}

/** Only wrong credentials (HTTP 401) use the allowance. Successful sign-ins never touch the counter. */
export async function limitFailedCredentialSignIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isCredentialSignIn = req.method === 'POST'
    && req.originalUrl.split('?', 1)[0] === '/api/auth/sign-in/email';
  if (!isCredentialSignIn) return next();

  try {
    const attempt = await limiter.begin(failedSignInKey(clientIp(req)));
    if (!attempt.ok) {
      res.setHeader('Retry-After', String(attempt.retryAfterSeconds));
      res.status(429).json({ message: 'Too many failed sign-in attempts. Please wait and try again.' });
      return;
    }
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      void attempt.finish(res.statusCode === 401).catch((error) => console.error('Unable to record failed sign-in.', error));
    };
    res.once('finish', settle);
    res.once('close', settle);
    next();
  } catch (error) {
    console.error('Failed sign-in limiter unavailable; refusing to skip it.', error);
    res.status(503).json({ message: 'Sign-in is temporarily unavailable.' });
  }
}
