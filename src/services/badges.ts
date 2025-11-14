/**
 * Badge Management Service
 *
 * Purpose:
 * - Normalize tags to badges (create if needed)
 * - Link badges to items (many-to-many)
 * - Query badges and their relationships
 *
 * AI Agent Hints:
 * - Badges are normalized tags with descriptions and colors
 * - entry_badges is the junction table for items-badges relationship
 * - Tags are case-insensitive (e.g., "AI" === "ai")
 *
 * Flow:
 * 1. normalizeBadges: Convert tag strings to badge IDs
 * 2. linkBadgesToItem: Create entry_badges relationships
 * 3. getItemBadges: Fetch badges for a specific item
 */

import { createLogger } from '../utils/logger';

/**
 * Badge entity
 */
export interface Badge {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Normalize tags to badges
 *
 * For each tag:
 * 1. Check if badge exists (case-insensitive)
 * 2. If not, create new badge
 * 3. Return array of badge IDs
 *
 * @param db - D1 database instance
 * @param tags - Array of tag strings
 * @returns Array of badge IDs
 */
export async function normalizeBadges(
  db: D1Database,
  tags: string[]
): Promise<number[]> {
  const badgeIds: number[] = [];

  // Fetch all existing badges
  const existingBadgesResult = await db
    .prepare('SELECT id, name FROM badges')
    .all();
  const existingBadges = existingBadgesResult.results as Array<{
    id: number;
    name: string;
  }>;

  for (const tag of tags) {
    const normalizedTag = tag.trim();
    if (!normalizedTag) continue;

    // Check if badge exists (case-insensitive)
    let badge = existingBadges.find(
      (b) => b.name.toLowerCase() === normalizedTag.toLowerCase()
    );

    if (!badge) {
      try {
        // Create new badge
        const insertResult = await db
          .prepare(
            'INSERT INTO badges (name, description) VALUES (?, ?) RETURNING id'
          )
          .bind(normalizedTag, `Auto-generated badge for ${normalizedTag}`)
          .first<{ id: number }>();

        if (insertResult?.id) {
          badgeIds.push(insertResult.id);
          // Add to cache for subsequent tags in this batch
          existingBadges.push({ id: insertResult.id, name: normalizedTag });
        }
      } catch (error) {
        console.error(`[BadgeService] Failed to create badge "${normalizedTag}":`, error);
        // Continue with other tags even if one fails
      }
    } else {
      badgeIds.push(badge.id);
    }
  }

  return badgeIds;
}

/**
 * Link badges to an item
 *
 * 1. Delete existing entry_badges for this item
 * 2. Insert new entry_badges relationships
 *
 * @param db - D1 database instance
 * @param itemId - Item ID (SHA-256 hash)
 * @param badgeIds - Array of badge IDs to link
 */
export async function linkBadgesToItem(
  db: D1Database,
  itemId: string,
  badgeIds: number[]
): Promise<void> {
  const logger = createLogger(db, 'BadgeService');

  try {
    // Delete existing relationships
    await db
      .prepare('DELETE FROM entry_badges WHERE entry_id = ?')
      .bind(itemId)
      .run();

    // Insert new relationships
    for (const badgeId of badgeIds) {
      await db
        .prepare('INSERT INTO entry_badges (entry_id, badge_id) VALUES (?, ?)')
        .bind(itemId, badgeId)
        .run();
    }

    await logger.info('BADGES_LINKED', {
      itemId,
      badgeCount: badgeIds.length,
    });
  } catch (error) {
    await logger.error('BADGE_LINK_FAILED', error, {
      itemId,
      badgeCount: badgeIds.length,
    });
    throw error;
  }
}

/**
 * Get badges for an item
 *
 * @param db - D1 database instance
 * @param itemId - Item ID (SHA-256 hash)
 * @returns Array of badges
 */
export async function getItemBadges(
  db: D1Database,
  itemId: string
): Promise<Badge[]> {
  const result = await db
    .prepare(
      `SELECT b.id, b.name, b.description, b.color, b.createdAt, b.updatedAt
       FROM badges b
       JOIN entry_badges eb ON b.id = eb.badge_id
       WHERE eb.entry_id = ?
       ORDER BY b.name ASC`
    )
    .bind(itemId)
    .all();

  return result.results as Badge[];
}

/**
 * Get all badges
 *
 * @param db - D1 database instance
 * @returns Array of all badges
 */
export async function getAllBadges(db: D1Database): Promise<Badge[]> {
  const result = await db
    .prepare('SELECT id, name, description, color, createdAt, updatedAt FROM badges ORDER BY name ASC')
    .all();

  return result.results as Badge[];
}

/**
 * Get badge usage stats
 *
 * @param db - D1 database instance
 * @returns Array of badges with usage counts
 */
export async function getBadgeStats(
  db: D1Database
): Promise<Array<Badge & { itemCount: number }>> {
  const result = await db
    .prepare(
      `SELECT b.id, b.name, b.description, b.color, b.createdAt, b.updatedAt,
              COUNT(eb.entry_id) as itemCount
       FROM badges b
       LEFT JOIN entry_badges eb ON b.id = eb.badge_id
       GROUP BY b.id
       ORDER BY itemCount DESC, b.name ASC`
    )
    .all();

  return result.results as Array<Badge & { itemCount: number }>;
}
