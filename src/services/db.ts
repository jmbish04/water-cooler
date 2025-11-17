/**
 * D1 Database Service Layer
 *
 * This file acts as a type-safe data access layer (DAL) for the application.
 * It abstracts all D1 database operations, ensuring that all interactions
 * (CRUD) are standardized, secure (using prepared statements), and observable.
 *
 * Responsibilities:
 * - CRUD operations for `sources`, `items`, `user_actions`, and `user_preferences`.
 * - Type-safe serialization and deserialization between D1 rows and domain types.
 * - Comprehensive logging for key write operations (createItem) to audit_logs.
 *
 * AI Agent Hints:
 * - All JSON fields (config, metadata, tags) are auto-serialized/deserialized.
 * - This layer returns strongly-typed domain objects, not raw D1 rows.
 */

import {
  Item,
  Source,
  UserAction,
  UserPreferences,
  SearchQuery,
  ItemMetadata,
  SourceConfig,
} from '../types/domain';
import { generateItemId } from '../utils/hash';
import { createLogger } from '../utils/logger';

// ============================================================================
// SOURCES
// ============================================================================

/**
 * Fetches all data sources from the database.
 * @param db The D1Database instance.
 * @param enabled (Optional) If true, fetches only enabled sources.
 * @returns A promise that resolves to an array of Source objects.
 */
export async function getSources(db: D1Database, enabled?: boolean): Promise<Source[]> {
  let query = 'SELECT * FROM sources';
  const params: unknown[] = [];

  if (enabled !== undefined) {
    query += ' WHERE enabled = ?';
    params.push(enabled ? 1 : 0);
  }

  query += ' ORDER BY name ASC';

  const result = await db.prepare(query).bind(...params).all();
  return (result.results || []).map(deserializeSource);
}

/**
 * Fetches a single source by its unique ID.
 * @param db The D1Database instance.
 * @param id The ID of the source to fetch.
 * @returns A promise that resolves to a Source object or null if not found.
 */
export async function getSourceById(db: D1Database, id: number): Promise<Source | null> {
  const result = await db.prepare('SELECT * FROM sources WHERE id = ?').bind(id).first();
  return result ? deserializeSource(result) : null;
}

/**
 * Creates a new data source in the database.
 * @param db The D1Database instance.
 * @param source The source object to create (without id, timestamps).
 * @returns A promise that resolves to the newly created Source object.
 */
export async function createSource(
  db: D1Database,
  source: Omit<Source, 'id' | 'createdAt' | 'updatedAt' | 'lastScan'>
): Promise<Source> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO sources (name, type, config, enabled, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .bind(source.name, source.type, JSON.stringify(source.config), source.enabled ? 1 : 0, now, now)
    .first();

  if (!result) throw new Error('Failed to create source');
  return deserializeSource(result);
}

/**
 * Updates the `lastScan` timestamp for a specific source.
 * @param db The D1Database instance.
 * @param id The ID of the source to update.
 */
export async function updateSourceLastScan(db: D1Database, id: number): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE sources SET lastScan = ?, updatedAt = ? WHERE id = ?')
    .bind(now, now, id)
    .run();
}

// ============================================================================
// ITEMS
// ============================================================================

/**
 * Fetches a paginated list of items based on complex filter criteria.
 * @param db The D1Database instance.
 * @param query A SearchQuery object containing filters (source, score, tags, user actions).
 * @returns A promise that resolves to an object containing the items and total count.
 */
export async function getItems(
  db: D1Database,
  query: SearchQuery
): Promise<{ items: Item[]; total: number }> {
  // Build WHERE clause
  let where = '1=1';
  const params: unknown[] = [];

  if (query.source) {
    where += ' AND s.type = ?';
    params.push(query.source);
  }

  if (query.minScore !== undefined) {
    where += ' AND i.score >= ?';
    params.push(query.minScore);
  }

  if (query.tags && query.tags.length > 0) {
    // Simple tag matching (JSON LIKE)
    const tagConditions = query.tags.map(() => 'i.tags LIKE ?').join(' OR ');
    where += ` AND (${tagConditions})`;
    query.tags.forEach((tag) => params.push(`%"${tag}"%`));
  }

  // User action filters (if userId provided)
  if (query.userId) {
    if (query.starred) {
      where += ` AND EXISTS (
        SELECT 1 FROM user_actions
        WHERE itemId = i.id AND userId = ? AND action = 'star'
      )`;
      params.push(query.userId);
    }

    if (query.unread) {
      where += ` AND NOT EXISTS (
        SELECT 1 FROM user_actions
        WHERE itemId = i.id AND userId = ? AND action = 'read'
      )`;
      params.push(query.userId);
    }

    if (query.followup) {
      where += ` AND EXISTS (
        SELECT 1 FROM user_actions
        WHERE itemId = i.id AND userId = ? AND action = 'followup'
      )`;
      params.push(query.userId);
    }
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM items i JOIN sources s ON i.sourceId = s.id WHERE ${where}`;
  const countResult = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
  const total = countResult?.total || 0;

  // Fetch items
  const limit = query.limit || 50;
  const offset = query.offset || 0;
  const itemsQuery = `
    SELECT i.* FROM items i
    JOIN sources s ON i.sourceId = s.id
    WHERE ${where}
    ORDER BY i.score DESC, i.createdAt DESC
    LIMIT ? OFFSET ?
  `;

  const itemsResult = await db.prepare(itemsQuery).bind(...params, limit, offset).all();
  const items = (itemsResult.results || []).map(deserializeItem);

  return { items, total };
}

/**
 * Fetches a single item by its deterministic ID (hash).
 * @param db The D1Database instance.
 * @param id The deterministic SHA-256 hash ID of the item.
 * @returns A promise that resolves to an Item object or null if not found.
 */
export async function getItemById(db: D1Database, id: string): Promise<Item | null> {
  const result = await db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
  return result ? deserializeItem(result) : null;
}

/**
 * Creates a new item or updates an existing one (upsert).
 * This is the primary function for saving curated content to the database.
 * It logs its outcome to the `audit_logs` table.
 * @param db The D1Database instance.
 * @param item The curated item data to save.
 * @returns A promise that resolves to the created/updated Item object.
 */
export async function createItem(
  db: D1Database,
  item: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Item> {
  const logger = createLogger(db, 'DBService');
  const now = new Date().toISOString();
  const id = await generateItemId(item.sourceId, item.url);

  try {
    // Upsert (update if exists)
    await db
      .prepare(
        `INSERT INTO items
         (id, sourceId, title, url, summary, tags, reason, score, vectorId, metadata, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           summary = excluded.summary,
           tags = excluded.tags,
           reason = excluded.reason,
           score = excluded.score,
           vectorId = excluded.vectorId,
           metadata = excluded.metadata,
           updatedAt = excluded.updatedAt`
      )
      .bind(
        id,
        item.sourceId,
        item.title,
        item.url,
        item.summary,
        item.tags ? JSON.stringify(item.tags) : null,
        item.reason,
        item.score,
        item.vectorId,
        item.metadata ? JSON.stringify(item.metadata) : null,
        now,
        now
      )
      .run();

    const created = await getItemById(db, id);
    if (!created) {
      throw new Error('Failed to retrieve item after create/upsert');
    }

    await logger.info('ITEM_CREATED', {
      itemId: id,
      sourceId: item.sourceId,
      url: item.url,
      score: item.score,
    });

    return created;
  } catch (error) {
    await logger.error('ITEM_CREATE_FAILED', error, {
      itemId: id,
      url: item.url,
      sourceId: item.sourceId,
      detail: 'Failed during D1 upsert.',
    });
    throw error; // Re-throw the error so the actor knows it failed
  }
}

// ============================================================================
// USER ACTIONS
// ============================================================================

/**
 * Records a user action (e.g., star, read, followup) in the database.
 * Handles de-duplication for 'unstar'.
 * @param db The D1Database instance.
 * @param action The action to record.
 */
export async function createUserAction(
  db: D1Database,
  action: Omit<UserAction, 'id' | 'createdAt'>
): Promise<void> {
  const now = new Date().toISOString();

  // For star/unstar and followup, delete opposite action first
  if (action.action === 'unstar') {
    await db
      .prepare('DELETE FROM user_actions WHERE itemId = ? AND userId = ? AND action = ?')
      .bind(action.itemId, action.userId, 'star')
      .run();
    return;
  }

  // Insert action
  await db
    .prepare('INSERT INTO user_actions (itemId, userId, action, createdAt) VALUES (?, ?, ?, ?)')
    .bind(action.itemId, action.userId, action.action, now)
    .run();
}

/**
 * Fetches all actions for a specific user, optionally filtered by action type.
 * @param db The D1Database instance.
 * @param userId The ID of the user.
 * @param action (Optional) The type of action to filter by (e.g., 'star').
 * @returns A promise that resolves to an array of UserAction objects.
 */
export async function getUserActions(
  db: D1Database,
  userId: string,
  action?: string
): Promise<UserAction[]> {
  let query = 'SELECT * FROM user_actions WHERE userId = ?';
  const params: unknown[] = [userId];

  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }

  query += ' ORDER BY createdAt DESC';

  const result = await db.prepare(query).bind(...params).all();
  return (result.results || []).map(deserializeUserAction);
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * Fetches the preferences for a specific user.
 * @param db The D1Database instance.
 * @param userId The ID of the user.
 * @returns A promise that resolves to a UserPreferences object or null if not found.
 */
export async function getUserPreferences(
  db: D1Database,
  userId: string
): Promise<UserPreferences | null> {
  const result = await db
    .prepare('SELECT * FROM user_preferences WHERE userId = ?')
    .bind(userId)
    .first();

  if (!result) return null;

  return {
    userId: result.userId as string,
    ...JSON.parse(result.preferences as string),
    createdAt: result.createdAt as string,
    updatedAt: result.updatedAt as string,
  };
}

/**
 * Creates or updates the preferences for a specific user (upsert).
 * @param db The D1Database instance.
 * @param userId The ID of the user.
 * @param preferences A partial UserPreferences object to save.
 */
export async function setUserPreferences(
  db: D1Database,
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO user_preferences (userId, preferences, createdAt, updatedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(userId) DO UPDATE SET
         preferences = excluded.preferences,
         updatedAt = excluded.updatedAt`
    )
    .bind(userId, JSON.stringify(preferences), now, now)
    .run();
}

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

/**
 * Deserializes a raw D1 row into a strongly-typed Source object.
 * @param row The raw database row.
 * @returns A Source object.
 */
function deserializeSource(row: any): Source {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: JSON.parse(row.config) as SourceConfig,
    enabled: row.enabled === 1,
    lastScan: row.lastScan,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Deserializes a raw D1 row into a strongly-typed Item object.
 * @param row The raw database row.
 * @returns An Item object.
 */
function deserializeItem(row: any): Item {
  return {
    id: row.id,
    sourceId: row.sourceId,
    title: row.title,
    url: row.url,
    summary: row.summary,
    tags: row.tags ? JSON.parse(row.tags) : null,
    reason: row.reason,
    score: row.score,
    vectorId: row.vectorId,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Deserializes a raw D1 row into a strongly-typed UserAction object.
 * @param row The raw database row.
 * @returns A UserAction object.
 */
function deserializeUserAction(row: any): UserAction {
  return {
    id: row.id,
    itemId: row.itemId,
    userId: row.userId,
    action: row.action,
    createdAt: row.createdAt,
  };
}
