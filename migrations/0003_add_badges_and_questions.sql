-- Migration: Add badges system and AI questions
-- Date: 2025-11-14
-- Purpose: Implement normalized badge/tag system and AI-generated follow-up questions

-- ============================================================================
-- BADGES: Normalized tags/categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT, -- hex color for UI
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_badges_name ON badges(name);

-- ============================================================================
-- ENTRY_BADGES: Many-to-many relationship between items and badges
-- ============================================================================
CREATE TABLE IF NOT EXISTS entry_badges (
  entry_id TEXT NOT NULL,
  badge_id INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entry_id, badge_id),
  FOREIGN KEY (entry_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
);

CREATE INDEX idx_entry_badges_entry ON entry_badges(entry_id);
CREATE INDEX idx_entry_badges_badge ON entry_badges(badge_id);

-- ============================================================================
-- ALTER ITEMS: Add ai_questions field and update score to 0-100 range
-- ============================================================================
ALTER TABLE items ADD COLUMN ai_questions TEXT; -- JSON array of follow-up questions

-- Note: SQLite doesn't support ALTER COLUMN, so we'll handle score conversion in application layer
-- Score will be stored as REAL but interpreted as 0-100 instead of 0.0-1.0

-- ============================================================================
-- Seed common badges
-- ============================================================================
INSERT OR IGNORE INTO badges (name, description, color) VALUES
  ('AI', 'Artificial Intelligence and Machine Learning', '#4C1D95'),
  ('Web', 'Web Development and Technologies', '#1E40AF'),
  ('Mobile', 'Mobile App Development', '#BE185D'),
  ('DevOps', 'DevOps and Infrastructure', '#0F766E'),
  ('Security', 'Security and Privacy', '#B91C1C'),
  ('Database', 'Database and Data Storage', '#CA8A04'),
  ('API', 'APIs and Integration', '#7C2D12'),
  ('Frontend', 'Frontend Development', '#5B21B6'),
  ('Backend', 'Backend Development', '#065F46'),
  ('Cloud', 'Cloud Computing and Services', '#1E3A8A'),
  ('Open Source', 'Open Source Projects', '#166534'),
  ('Tutorial', 'Tutorials and Learning Resources', '#92400E'),
  ('News', 'Industry News and Updates', '#4338CA'),
  ('Tool', 'Developer Tools and Utilities', '#6D28D9'),
  ('Framework', 'Frameworks and Libraries', '#BE123C');
