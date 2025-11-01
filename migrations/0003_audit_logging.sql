/**
 * Migration 0003: Comprehensive Audit Logging
 *
 * Creates audit_logs table for complete observability:
 * - All actor operations
 * - API requests/responses
 * - External API calls
 * - Errors with full stack traces
 * - Performance timing
 */

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  level TEXT NOT NULL,
  scope TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT,
  itemId TEXT,
  source TEXT,
  userId TEXT,
  durationMs INTEGER,
  errorStack TEXT
);

CREATE INDEX idx_audit_ts ON audit_logs(ts DESC);
CREATE INDEX idx_audit_scope ON audit_logs(scope);
CREATE INDEX idx_audit_level ON audit_logs(level);
CREATE INDEX idx_audit_event ON audit_logs(event);
CREATE INDEX idx_audit_item ON audit_logs(itemId);
