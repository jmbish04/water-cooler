/**
 * D1 Database Service Layer (Kysely)
 *
 * Type-safe data access layer using Kysely query builder.
 * Replaces raw SQL queries with type-safe operations.
 *
 * Responsibilities:
 * - CRUD operations for all tables
 * - Type-safe serialization/deserialization
 * - Comprehensive logging for write operations
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
import { getDb, tryParseJson, toJsonString } from '../db/kysely';
import { generateItemId } from '../utils/hash';
import { createLogger } from '../utils/logger';

// ============================================================================
// SOURCES
// ============================================================================

/**
 * Fetches all data sources from the database
 */
export async function getSources(db: D1Database, enabled?: boolean): Promise<Source[]> {
  const kysely = getDb(db);

  let query = kysely.selectFrom('sources').selectAll();

  if (enabled !== undefined) {
    query = query.where('enabled', '=', enabled ? 1 : 0);
  }

  const rows = await query.orderBy('name', 'asc').execute();

  return rows.map(deserializeSource);
}

/**
 * Fetches a single source by its unique ID
 */
export async function getSourceById(db: D1Database, id: number): Promise<Source | null> {
  const kysely = getDb(db);

  const row = await kysely
    .selectFrom('sources')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  return row ? deserializeSource(row) : null;
}

/**
 * Creates a new data source in the database
 */
export async function createSource(
  db: D1Database,
  source: Omit<Source, 'id' | 'createdAt' | 'updatedAt' | 'lastScan'>
): Promise<Source> {
  const kysely = getDb(db);
  const now = new Date().toISOString();

  const result = await kysely
    .insertInto('sources')
    .values({
      name: source.name,
      type: source.type,
      config: toJsonString(source.config),
      enabled: source.enabled ? 1 : 0,
      createdAt: now,
      updatedAt: now,
      lastScan: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return deserializeSource(result);
}

/**
 * Updates the lastScan timestamp for a specific source
 */
export async function updateSourceLastScan(db: D1Database, id: number): Promise<void> {
  const kysely = getDb(db);
  const now = new Date().toISOString();

  await kysely
    .updateTable('sources')
    .set({
      lastScan: now,
      updatedAt: now,
    })
    .where('id', '=', id)
    .execute();
}

/**
 * Deserialize source row from database
 */
function deserializeSource(row: any): Source {
  return {
    id: row.id,
    name: row.name,
    type: row.type as SourceType,
    config: tryParseJson<SourceConfig>(row.config) || ({} as SourceConfig),
    enabled: Boolean(row.enabled),
    lastScan: row.lastScan || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ============================================================================
// ITEMS
// ============================================================================

/**
 * Fetches a paginated list of items based on complex filter criteria
 */
export async function getItems(
  db: D1Database,
  query: SearchQuery
): Promise<{ items: Item[]; total: number }> {
  const kysely = getDb(db);

  // Build base query with join
  let itemsQuery = kysely
    .selectFrom('items as i')
    .innerJoin('sources as s', 's.id', 'i.sourceId')
    .selectAll('i');

  // Apply filters
  if (query.source) {
    itemsQuery = itemsQuery.where('s.type', '=', query.source);
  }

  if (query.minScore !== undefined) {
    itemsQuery = itemsQuery.where('i.score', '>=', query.minScore);
  }

  if (query.tags && query.tags.length > 0) {
    // Simple tag matching with LIKE
    const tagConditions = query.tags.map(tag => `i.tags LIKE '%"${tag}"%'`).join(' OR ');
    itemsQuery = itemsQuery.where(({ eb, or }) =>
      or(query.tags!.map(tag => eb('i.tags', 'like', `%"${tag}"%`)))
    );
  }

  // User action filters
  if (query.userId) {
    if (query.starred) {
      itemsQuery = itemsQuery.where(({ exists, selectFrom }) =>
        exists(
          selectFrom('user_actions')
            .whereRef('itemId', '=', 'i.id')
            .where('userId', '=', query.userId!)
            .where('action', '=', 'star')
            .select(kysely.fn.count('id').as('count'))
        )
      );
    }

    if (query.unread) {
      itemsQuery = itemsQuery.where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('user_actions')
              .whereRef('itemId', '=', 'i.id')
              .where('userId', '=', query.userId!)
              .where('action', '=', 'read')
              .select(kysely.fn.count('id').as('count'))
          )
        )
      );
    }

    if (query.followup) {
      itemsQuery = itemsQuery.where(({ exists, selectFrom }) =>
        exists(
          selectFrom('user_actions')
            .whereRef('itemId', '=', 'i.id')
            .where('userId', '=', query.userId!)
            .where('action', '=', 'followup')
            .select(kysely.fn.count('id').as('count'))
        )
      );
    }
  }

  // Get total count
  const countResult = await kysely
    .selectFrom(itemsQuery.as('filtered'))
    .select(kysely.fn.count('id').as('count'))
    .executeTakeFirst();

  const total = Number(countResult?.count || 0);

  // Get paginated items
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const rows = await itemsQuery
    .orderBy('i.createdAt', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  const items = rows.map(deserializeItem);

  return { items, total };
}

/**
 * Fetches a single item by its deterministic ID (hash)
 */
export async function getItemById(db: D1Database, id: string): Promise<Item | null> {
  const kysely = getDb(db);

  const row = await kysely
    .selectFrom('items')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  return row ? deserializeItem(row) : null;
}

/**
 * Creates a new item or updates an existing one (upsert)
 */
export async function createItem(
  db: D1Database,
  item: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Item> {
  const kysely = getDb(db);
  const logger = createLogger(db, 'DBService');
  const now = new Date().toISOString();
  const id = await generateItemId(item.sourceId, item.url);

  try {
    // Upsert using raw SQL since Kysely doesn't support ON CONFLICT directly
    await db
      .prepare(
        `INSERT INTO items
         (id, sourceId, title, url, summary, tags, reason, score, ai_questions, vectorId, metadata, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           summary = excluded.summary,
           tags = excluded.tags,
           reason = excluded.reason,
           score = excluded.score,
           ai_questions = excluded.ai_questions,
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
        toJsonString(item.tags),
        item.reason,
        item.score,
        toJsonString(item.aiQuestions),
        item.vectorId,
        toJsonString(item.metadata),
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
    throw error;
  }
}

/**
 * Deserialize item row from database
 */
function deserializeItem(row: any): Item {
  return {
    id: row.id,
    sourceId: row.sourceId,
    title: row.title,
    url: row.url,
    summary: row.summary || null,
    tags: tryParseJson<string[]>(row.tags) || null,
    reason: row.reason || null,
    score: row.score || 0,
    aiQuestions: tryParseJson<string[]>(row.ai_questions) || null,
    vectorId: row.vectorId || null,
    metadata: tryParseJson<ItemMetadata>(row.metadata) || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ============================================================================
// USER ACTIONS
// ============================================================================

/**
 * Records a user action (e.g., star, read, followup) in the database
 */
export async function recordUserAction(
  db: D1Database,
  action: Omit<UserAction, 'id' | 'createdAt'>
): Promise<void> {
  const kysely = getDb(db);

  // Handle 'unstar' by deleting the star action
  if (action.action === 'unstar') {
    await kysely
      .deleteFrom('user_actions')
      .where('itemId', '=', action.itemId)
      .where('userId', '=', action.userId)
      .where('action', '=', 'star')
      .execute();
    return;
  }

  // Insert new action
  await kysely
    .insertInto('user_actions')
    .values({
      itemId: action.itemId,
      userId: action.userId,
      action: action.action,
      createdAt: new Date().toISOString(),
    })
    .execute();
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * Fetches user preferences by userId
 */
export async function getUserPreferences(
  db: D1Database,
  userId: string
): Promise<UserPreferences | null> {
  const kysely = getDb(db);

  const row = await kysely
    .selectFrom('user_preferences')
    .selectAll()
    .where('userId', '=', userId)
    .executeTakeFirst();

  if (!row) return null;

  return {
    userId: row.userId,
    preferences: tryParseJson(row.preferences) || {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Creates or updates user preferences
 */
export async function upsertUserPreferences(
  db: D1Database,
  userId: string,
  preferences: Record<string, unknown>
): Promise<void> {
  const kysely = getDb(db);
  const now = new Date().toISOString();

  // Use raw SQL for upsert
  await db
    .prepare(
      `INSERT INTO user_preferences (userId, preferences, createdAt, updatedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(userId) DO UPDATE SET
         preferences = excluded.preferences,
         updatedAt = excluded.updatedAt`
    )
    .bind(userId, toJsonString(preferences), now, now)
    .run();
}
