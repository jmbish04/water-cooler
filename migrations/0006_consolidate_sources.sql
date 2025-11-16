-- Consolidate granular sources into platform-level connectors
-- Migration: 0006_consolidate_sources.sql

-- ============================================================================
-- Step 1: Create new consolidated sources with descriptive names
-- ============================================================================

-- Reddit Communities connector
INSERT INTO sources (name, type, config, enabled, createdAt, updatedAt, lastScan)
VALUES (
  'Reddit Communities',
  'reddit',
  '{"useAuthenticatedFeed": true, "sort": "new"}',
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

-- GitHub Repositories connector
INSERT INTO sources (name, type, config, enabled, createdAt, updatedAt, lastScan)
VALUES (
  'GitHub Repositories',
  'github',
  '{"strategies": ["trending", "top"], "since": "daily"}',
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

-- App Store Search connector
INSERT INTO sources (name, type, config, enabled, createdAt, updatedAt, lastScan)
VALUES (
  'App Store Search',
  'appstore',
  '{"processAll": true, "country": "US"}',
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

-- Discord Channels connector
INSERT INTO sources (name, type, config, enabled, createdAt, updatedAt, lastScan)
VALUES (
  'Discord Channels',
  'discord',
  '{"useAuthenticatedChannels": true}',
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

-- ============================================================================
-- Step 2: Update all existing items to reassign sourceId to new consolidated sources
-- ============================================================================

-- Update items from old Reddit sources to new Reddit connector
UPDATE items
SET sourceId = (SELECT id FROM sources WHERE name = 'Reddit Communities' AND type = 'reddit' LIMIT 1)
WHERE sourceId IN (SELECT id FROM sources WHERE type = 'reddit' AND name != 'Reddit Communities');

-- Update items from old GitHub sources to new GitHub connector
UPDATE items
SET sourceId = (SELECT id FROM sources WHERE name = 'GitHub Repositories' AND type = 'github' LIMIT 1)
WHERE sourceId IN (SELECT id FROM sources WHERE type = 'github' AND name != 'GitHub Repositories');

-- Update items from old App Store sources to new App Store connector
UPDATE items
SET sourceId = (SELECT id FROM sources WHERE name = 'App Store Search' AND type = 'appstore' LIMIT 1)
WHERE sourceId IN (SELECT id FROM sources WHERE type = 'appstore' AND name != 'App Store Search');

-- Update items from old Discord sources to new Discord connector
UPDATE items
SET sourceId = (SELECT id FROM sources WHERE name = 'Discord Channels' AND type = 'discord' LIMIT 1)
WHERE sourceId IN (SELECT id FROM sources WHERE type = 'discord' AND name != 'Discord Channels');

-- Note: Igdux source stays as-is since it's already a single connector

-- ============================================================================
-- Step 3: Delete old granular sources (only if new consolidated sources exist)
-- ============================================================================

-- Only delete old sources if the new consolidated sources were created successfully
DELETE FROM sources 
WHERE type = 'reddit' AND name != 'Reddit Communities'
   OR type = 'github' AND name != 'GitHub Repositories'
   OR type = 'appstore' AND name != 'App Store Search'
   OR type = 'discord' AND name != 'Discord Channels';

-- ============================================================================
-- Step 4: Reset auto-increment (optional but good practice)
-- ============================================================================

-- SQLite doesn't support ALTER TABLE to reset auto-increment directly
-- The next INSERT will use the next available ID, which is fine

