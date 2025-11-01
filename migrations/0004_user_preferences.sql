/**
 * Migration 0004: User Preferences & Digest History
 *
 * Adds support for:
 * - Per-user preferences (digest frequency, source filters, etc.)
 * - Email digest tracking and deduplication
 */

-- User preferences
CREATE TABLE user_preferences (
  userId TEXT PRIMARY KEY,
  preferences TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Digest history
CREATE TABLE digest_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  sentAt TEXT NOT NULL DEFAULT (datetime('now')),
  itemCount INTEGER NOT NULL,
  emailHash TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX idx_digest_user ON digest_history(userId);
CREATE INDEX idx_digest_sent ON digest_history(sentAt DESC);
