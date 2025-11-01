/**
 * Comprehensive Audit Logging Utility
 *
 * Purpose:
 * - Write all significant operations to audit_logs table
 * - Track success, errors, timing, and context
 * - Enable debugging and compliance auditing
 *
 * AI Agent Hints:
 * - Always call writeAuditLog() for actor operations, API requests, external fetches
 * - Include durationMs for performance monitoring
 * - Capture full error stacks for debugging
 * - Use appropriate log levels: INFO (normal), WARN (recoverable), ERROR (failure)
 *
 * Usage:
 * ```ts
 * const start = Date.now();
 * try {
 *   // ... operation
 *   await writeAuditLog(env.DB, {
 *     level: 'INFO',
 *     scope: 'GitHubActor',
 *     event: 'FETCH_SUCCESS',
 *     detail: { repos: 5 },
 *     durationMs: Date.now() - start,
 *   });
 * } catch (error) {
 *   await writeAuditLog(env.DB, {
 *     level: 'ERROR',
 *     scope: 'GitHubActor',
 *     event: 'FETCH_FAILED',
 *     detail: { error: error.message },
 *     errorStack: error.stack,
 *     durationMs: Date.now() - start,
 *   });
 * }
 * ```
 */

import { AuditLog, LogLevel, SourceType } from '../types/domain';

/**
 * Write audit log entry to D1 database
 *
 * Step 1 - Prepare log entry with defaults
 * Step 2 - Serialize detail JSON if present
 * Step 3 - Insert into audit_logs table
 * Step 4 - Console log for immediate visibility
 */
export async function writeAuditLog(
  db: D1Database,
  log: Omit<AuditLog, 'id' | 'ts'>
): Promise<void> {
  try {
    // Step 1 - Add timestamp
    const ts = new Date().toISOString();

    // Step 2 - Serialize detail object
    const detailJson = log.detail ? JSON.stringify(log.detail) : null;

    // Step 3 - Insert into database
    await db
      .prepare(
        `INSERT INTO audit_logs
         (ts, level, scope, event, detail, itemId, source, userId, durationMs, errorStack)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ts,
        log.level,
        log.scope,
        log.event,
        detailJson,
        log.itemId || null,
        log.source || null,
        log.userId || null,
        log.durationMs || null,
        log.errorStack || null
      )
      .run();

    // Step 4 - Console output for dev/debugging
    const logPrefix = `[${ts}] ${log.level} [${log.scope}] ${log.event}`;
    const logMessage = log.detail ? `${logPrefix}: ${JSON.stringify(log.detail)}` : logPrefix;

    if (log.level === 'ERROR') {
      console.error(logMessage, log.errorStack || '');
    } else if (log.level === 'WARN') {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }
  } catch (error) {
    // Fallback: if audit log write fails, still log to console
    console.error('[AUDIT_LOG_FAILED]', error, log);
  }
}

/**
 * Create a logger instance scoped to a specific component
 *
 * Returns convenience methods for info/warn/error logging
 */
export function createLogger(db: D1Database, scope: string) {
  return {
    info: async (
      event: string,
      detail?: Record<string, unknown>,
      options?: {
        itemId?: string;
        source?: SourceType;
        userId?: string;
        durationMs?: number;
      }
    ) => {
      await writeAuditLog(db, {
        level: 'INFO',
        scope,
        event,
        detail,
        ...options,
      });
    },

    warn: async (
      event: string,
      detail?: Record<string, unknown>,
      options?: {
        itemId?: string;
        source?: SourceType;
        userId?: string;
        durationMs?: number;
      }
    ) => {
      await writeAuditLog(db, {
        level: 'WARN',
        scope,
        event,
        detail,
        ...options,
      });
    },

    error: async (
      event: string,
      error: Error | unknown,
      options?: {
        itemId?: string;
        source?: SourceType;
        userId?: string;
        durationMs?: number;
      }
    ) => {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      await writeAuditLog(db, {
        level: 'ERROR',
        scope,
        event,
        detail: { error: errorObj.message },
        errorStack: errorObj.stack,
        ...options,
      });
    },

    /**
     * Time an async operation and auto-log with duration
     */
    async timed<T>(
      event: string,
      operation: () => Promise<T>,
      options?: {
        itemId?: string;
        source?: SourceType;
        userId?: string;
      }
    ): Promise<T> {
      const start = Date.now();
      try {
        const result = await operation();
        await this.info(event, undefined, {
          ...options,
          durationMs: Date.now() - start,
        });
        return result;
      } catch (error) {
        await this.error(event, error, {
          ...options,
          durationMs: Date.now() - start,
        });
        throw error;
      }
    },
  };
}

/**
 * Query recent audit logs (for debugging/admin UI)
 */
export async function getRecentLogs(
  db: D1Database,
  options: {
    scope?: string;
    level?: LogLevel;
    limit?: number;
  } = {}
): Promise<AuditLog[]> {
  const { scope, level, limit = 100 } = options;

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: unknown[] = [];

  if (scope) {
    query += ' AND scope = ?';
    params.push(scope);
  }

  if (level) {
    query += ' AND level = ?';
    params.push(level);
  }

  query += ' ORDER BY ts DESC LIMIT ?';
  params.push(limit);

  const result = await db.prepare(query).bind(...params).all<AuditLog>();

  return (result.results || []).map((row) => ({
    ...row,
    detail: row.detail ? JSON.parse(row.detail as unknown as string) : undefined,
  }));
}
