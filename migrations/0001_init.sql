/**
 * Migration 0001: Initial Schema
 *
 * Creates core tables for:
 * - sources: External data source configuration
 * - items: Curated content
 * - user_actions: User interactions
 *
 * Applied: Initial deployment
 */

-- Sources configuration
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  config TEXT,
  enabled INTEGER DEFAULT 1,
  lastScan TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_enabled ON sources(enabled);

-- Curated items
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  sourceId INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  summary TEXT,
  tags TEXT,
  reason TEXT,
  score REAL DEFAULT 0.0,
  vectorId TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(sourceId) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE INDEX idx_items_source ON items(sourceId);
CREATE INDEX idx_items_score ON items(score DESC);
CREATE INDEX idx_items_created ON items(createdAt DESC);

-- User actions
CREATE TABLE user_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId TEXT NOT NULL,
  userId TEXT NOT NULL,
  action TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(itemId) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX idx_actions_item ON user_actions(itemId);
CREATE INDEX idx_actions_user ON user_actions(userId);
CREATE INDEX idx_actions_user_action ON user_actions(userId, action);

-- Initial sources
INSERT INTO sources (name, type, config) VALUES
  ('Cloudflare Workers Examples', 'github', '{"org": "cloudflare", "repos": ["workers-sdk", "workers-examples"]}'),
  ('Trending AI Tools', 'appstore', '{"category": "productivity", "term": "AI"}');
