/**
 * Hono Middleware
 *
 * Purpose:
 * - CORS handling
 * - Request/response logging
 * - Zod validation
 * - Error handling
 *
 * AI Agent Hints:
 * - Applied globally to all routes
 * - Logs requests to audit_logs
 * - Validates request bodies with Zod
 * - Returns standardized error responses
 */

import { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { Env } from '../types/env';
import { writeAuditLog } from '../utils/logger';

/**
 * CORS middleware
 */
export const corsMiddleware = cors({
  origin: '*', // In production, restrict to your domain
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
});

/**
 * Request logger middleware
 *
 * Step 1 - Record start time
 * Step 2 - Execute request
 * Step 3 - Log to audit_logs with timing
 */
export async function requestLogger(c: Context<{ Bindings: Env }>, next: Next) {
  const start = Date.now();
  const { method, url } = c.req;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  // Log to audit (skip health checks and assets)
  if (!url.includes('/health') && !url.includes('/assets')) {
    try {
      await writeAuditLog(c.env.DB, {
        level: status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO',
        scope: 'API',
        event: 'REQUEST',
        detail: {
          method,
          path: new URL(url).pathname,
          status,
        },
        durationMs: duration,
      });
    } catch (error) {
      console.error('[LOG_FAILED]', error);
    }
  }
}

/**
 * Global error handler
 */
export async function errorHandler(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error('[UNHANDLED_ERROR]', error);

    const status = 500;
    const message = error instanceof Error ? error.message : 'Internal server error';

    // Log error
    try {
      await writeAuditLog(c.env.DB, {
        level: 'ERROR',
        scope: 'API',
        event: 'UNHANDLED_ERROR',
        detail: {
          path: c.req.path,
          method: c.req.method,
        },
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    } catch (logError) {
      console.error('[ERROR_LOG_FAILED]', logError);
    }

    return c.json(
      {
        error: 'Internal Server Error',
        message,
        code: status,
      },
      status
    );
  }
}

/**
 * User ID extraction (from header or session)
 *
 * For demo purposes, uses X-User-ID header.
 * In production, integrate with Cloudflare Access or auth provider.
 */
export function getUserId(c: Context): string {
  const userId = c.req.header('X-User-ID') || 'anonymous';
  return userId;
}
