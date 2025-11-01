/**
 * Complete D1 Database Schema for AI-Curated Discovery Hub
 *
 * Purpose:
 * - Store discovered items from multiple sources (GitHub, App Store, Reddit, Discord)
 * - Track user interactions (read, star, follow-up)
 * - Maintain comprehensive audit logs for observability
 * - Support source configuration and scheduling
 *
 * AI Agent Hints:
 * - Use migrations/ for incremental changes
 * - All timestamps in ISO 8601 format
 * - items.id is deterministic hash of source+url for deduplication
 * - vectorId links to Vectorize index for semantic search
 * - audit_logs captures ALL significant operations with timing
 */

-- ============================================================================
-- SOURCES: External data sources configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- e.g., "cloudflare-workers", "hacker-news"
  type TEXT NOT NULL,                -- github | appstore | reddit | discord
  config TEXT,                       -- JSON: {org, repo, subreddit, channelId, etc.}
  enabled INTEGER DEFAULT 1,         -- 0 = disabled, 1 = enabled
  lastScan TEXT,                     -- ISO timestamp of last successful scan
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_enabled ON sources(enabled);

-- ============================================================================
-- ITEMS: Curated content from all sources
-- ============================================================================
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,               -- SHA-256 hash of source+url for dedup
  sourceId INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  summary TEXT,                      -- AI-generated summary
  tags TEXT,                         -- JSON array of tags
  reason TEXT,                       -- Why this was curated (AI explanation)
  score REAL DEFAULT 0.0,            -- AI curation score (0.0-1.0)
  vectorId TEXT,                     -- Vectorize index key for embeddings
  metadata TEXT,                     -- JSON: stars, author, language, etc.
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(sourceId) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE INDEX idx_items_source ON items(sourceId);
CREATE INDEX idx_items_score ON items(score DESC);
CREATE INDEX idx_items_created ON items(createdAt DESC);
CREATE INDEX idx_items_vector ON items(vectorId);

-- ============================================================================
-- USER_ACTIONS: Track user interactions with items
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId TEXT NOT NULL,
  userId TEXT NOT NULL,              -- user identifier (session/auth)
  action TEXT NOT NULL,              -- read | star | followup | unstar
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(itemId) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX idx_actions_item ON user_actions(itemId);
CREATE INDEX idx_actions_user ON user_actions(userId);
CREATE INDEX idx_actions_user_action ON user_actions(userId, action);

-- ============================================================================
-- AUDIT_LOGS: Comprehensive observability and debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),  -- ISO timestamp
  level TEXT NOT NULL,                         -- INFO | WARN | ERROR
  scope TEXT NOT NULL,                         -- actor/service/route name
  event TEXT NOT NULL,                         -- SCAN_STARTED, FETCH_FAILED, etc.
  detail TEXT,                                 -- JSON: structured context
  itemId TEXT,                                 -- optional item linkage
  source TEXT,                                 -- github/appstore/reddit/discord
  userId TEXT,                                 -- optional user linkage
  durationMs INTEGER,                          -- operation timing
  errorStack TEXT                              -- full stack trace for errors
);

CREATE INDEX idx_audit_ts ON audit_logs(ts DESC);
CREATE INDEX idx_audit_scope ON audit_logs(scope);
CREATE INDEX idx_audit_level ON audit_logs(level);
CREATE INDEX idx_audit_event ON audit_logs(event);
CREATE INDEX idx_audit_item ON audit_logs(itemId);

-- ============================================================================
-- USER_PREFERENCES: Per-user configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  userId TEXT PRIMARY KEY,
  preferences TEXT NOT NULL,         -- JSON: {digestFrequency, sources, tags, etc.}
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- DIGEST_HISTORY: Track sent email digests
-- ============================================================================
CREATE TABLE IF NOT EXISTS digest_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  sentAt TEXT NOT NULL DEFAULT (datetime('now')),
  itemCount INTEGER NOT NULL,
  emailHash TEXT NOT NULL,           -- SHA-256 of email content for dedup
  status TEXT NOT NULL,              -- sent | failed | bounced
  detail TEXT                        -- JSON: error details if failed
);

CREATE INDEX idx_digest_user ON digest_history(userId);
CREATE INDEX idx_digest_sent ON digest_history(sentAt DESC);

-- ============================================================================
-- Initial Data: Default sources
-- ============================================================================
INSERT OR IGNORE INTO sources (name, type, config) VALUES
  ('Cloudflare Workers Examples', 'github', '{"org": "cloudflare", "repos": ["workers-sdk", "workers-examples"]}'),
  ('Trending AI Tools', 'appstore', '{"category": "productivity", "term": "AI"}'),
  ('r/CloudFlare', 'reddit', '{"subreddit": "CloudFlare", "sort": "hot"}'),
  ('r/WebDev', 'reddit', '{"subreddit": "webdev", "sort": "top"}');
