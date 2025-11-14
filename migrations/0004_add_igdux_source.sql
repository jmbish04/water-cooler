-- Migration: Add Igdux source for Cloudflare Worker projects
-- Date: 2025-11-14
-- Purpose: Add Igdux as a content source with auto-translation from Chinese to English

-- ============================================================================
-- Add Igdux source
-- ============================================================================
INSERT OR IGNORE INTO sources (name, type, config, enabled, createdAt, updatedAt)
VALUES (
  'Igdux - Cloudflare Workers Collection',
  'igdux',
  '{"enabled": true}',
  1,
  datetime('now'),
  datetime('now')
);
