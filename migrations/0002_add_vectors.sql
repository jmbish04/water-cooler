/**
 * Migration 0002: Add Vectorize Support
 *
 * Adds vectorId column to items table for linking to Vectorize embeddings
 * Creates index for efficient vector lookups
 */

-- Add vectorId if it doesn't exist (safe for re-runs)
ALTER TABLE items ADD COLUMN vectorId TEXT;

-- Create index for vector lookups
CREATE INDEX IF NOT EXISTS idx_items_vector ON items(vectorId);
