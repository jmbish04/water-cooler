/**
 * HTTP Response Helpers for Hono
 *
 * Purpose:
 * - Standardized JSON responses
 * - Error formatting with proper status codes
 * - Type-safe response builders
 *
 * AI Agent Hints:
 * - Use these instead of raw c.json() for consistency
 * - All errors are logged to audit_logs
 * - Responses include proper headers (CORS, content-type)
 */

import { Context } from 'hono';
import { ErrorResponseAPI } from '../types/api';
import { writeAuditLog } from './logger';

/**
 * Success response (200 OK)
 */
export function jsonOk<T>(c: Context, data: T, status = 200) {
  return c.json(data, status);
}

/**
 * Created response (201 Created)
 */
export function jsonCreated<T>(c: Context, data: T) {
  return c.json(data, 201);
}

/**
 * No content response (204 No Content)
 */
export function noContent(c: Context) {
  return c.body(null, 204);
}

/**
 * Error response with standard format
 *
 * Step 1 - Determine status code from error type
 * Step 2 - Format error message
 * Step 3 - Log to audit_logs
 * Step 4 - Return JSON error
 */
export async function jsonError(
  c: Context,
  error: Error | string,
  status = 500,
  details?: Record<string, unknown>
): Promise<Response> {
  // Step 1 - Extract error message
  const message = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'string' ? undefined : error.stack;

  // Step 2 - Build error response
  const errorResponse: ErrorResponseAPI = {
    error: getErrorName(status),
    message,
    code: status,
    details,
  };

  // Step 3 - Log error to audit (skip for 404s to reduce noise)
  if (status >= 500) {
    try {
      const env = c.env as { DB?: D1Database };
      if (env.DB) {
        await writeAuditLog(env.DB, {
          level: 'ERROR',
          scope: 'API',
          event: 'REQUEST_ERROR',
          detail: {
            path: c.req.path,
            method: c.req.method,
            status,
            message,
            ...details,
          },
          errorStack: stack,
        });
      }
    } catch (logError) {
      console.error('[ERROR_LOG_FAILED]', logError);
    }
  }

  // Step 4 - Return error response
  return c.json(errorResponse, status);
}

/**
 * Bad request error (400)
 */
export function badRequest(c: Context, message: string, details?: Record<string, unknown>) {
  return jsonError(c, message, 400, details);
}

/**
 * Unauthorized error (401)
 */
export function unauthorized(c: Context, message = 'Unauthorized') {
  return jsonError(c, message, 401);
}

/**
 * Forbidden error (403)
 */
export function forbidden(c: Context, message = 'Forbidden') {
  return jsonError(c, message, 403);
}

/**
 * Not found error (404)
 */
export function notFound(c: Context, message = 'Not found') {
  return jsonError(c, message, 404);
}

/**
 * Internal server error (500)
 */
export function internalError(c: Context, error: Error | string) {
  return jsonError(c, error, 500);
}

/**
 * Get error name from status code
 */
function getErrorName(status: number): string {
  const names: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };

  return names[status] || 'Error';
}

/**
 * Validate and parse JSON body
 */
export async function parseJsonBody<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
}
