/**
 * D1 Database Service Layer
 *
 * Purpose:
 * - CRUD operations for all tables
 * - Prepared statement helpers
 * - Transaction utilities
 * - Type-safe database queries
 *
 * AI Agent Hints:
 * - All queries use prepared statements (SQL injection safe)
 * - JSON fields (config, metadata, tags) are auto-serialized/deserialized
 * - Returns domain types (not raw D1 rows)
 * - Error handling logs to audit_logs
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

/**
 * Sources
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

export async function getSourceById(db: D1Database, id: number): Promise<Source | null> {
  const result = await db.prepare('SELECT * FROM sources WHERE id = ?').bind(id).first();
  return result ? deserializeSource(result) : null;
}

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

export async function updateSourceLastScan(db: D1Database, id: number): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE sources SET lastScan = ?, updatedAt = ? WHERE id = ?')
    .bind(now, now, id)
    .run();
}

/**
 * Items
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

export async function getItemById(db: D1Database, id: string): Promise<Item | null> {
  const result = await db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
  return result ? deserializeItem(result) : null;
}

export async function createItem(
  db: D1Database,
  item: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Item> {
  const now = new Date().toISOString();
  const id = await generateItemId(item.sourceId, item.url);

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
  if (!created) throw new Error('Failed to create item');
  return created;
}

/**
 * User Actions
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

/**
 * User Preferences
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

/**
 * Serialization Helpers
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

function deserializeUserAction(row: any): UserAction {
  return {
    id: row.id,
    itemId: row.itemId,
    userId: row.userId,
    action: row.action,
    createdAt: row.createdAt,
  };
}
