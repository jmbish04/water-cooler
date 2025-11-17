/**
 * Database Schema (Drizzle ORM)
 *
 * Complete schema definition for all tables in the water-cooler application.
 * Used by Drizzle for migrations and by Kysely for type-safe queries.
 */

import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// SOURCES: External data sources configuration
// ============================================================================
export const sources = sqliteTable(
  'sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    type: text('type').notNull(), // github | appstore | reddit | discord
    config: text('config'), // JSON string
    enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
    lastScan: text('lastScan'),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    typeIdx: index('idx_sources_type').on(table.type),
    enabledIdx: index('idx_sources_enabled').on(table.enabled),
  })
);

// ============================================================================
// ITEMS: Curated content from all sources
// ============================================================================
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(), // SHA-256 hash
    sourceId: integer('sourceId')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    url: text('url').notNull().unique(),
    summary: text('summary'),
    tags: text('tags'), // JSON array (legacy - use entry_badges for normalized tags)
    reason: text('reason'),
    score: real('score').default(0.0), // 0-100 range (stored as REAL for SQLite compatibility)
    aiQuestions: text('ai_questions'), // JSON array of AI-generated follow-up questions
    vectorId: text('vectorId'),
    metadata: text('metadata'), // JSON object
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    sourceIdx: index('idx_items_source').on(table.sourceId),
    scoreIdx: index('idx_items_score').on(table.score),
    createdIdx: index('idx_items_created').on(table.createdAt),
    vectorIdx: index('idx_items_vector').on(table.vectorId),
  })
);

// ============================================================================
// USER_ACTIONS: Track user interactions with items
// ============================================================================
export const userActions = sqliteTable(
  'user_actions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('itemId')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    userId: text('userId').notNull(),
    action: text('action').notNull(), // read | star | followup | unstar
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    itemIdx: index('idx_actions_item').on(table.itemId),
    userIdx: index('idx_actions_user').on(table.userId),
    userActionIdx: index('idx_actions_user_action').on(table.userId, table.action),
  })
);

// ============================================================================
// AUDIT_LOGS: Comprehensive observability and debugging
// ============================================================================
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: text('ts')
      .notNull()
      .default(sql`(datetime('now'))`),
    level: text('level').notNull(), // INFO | WARN | ERROR
    scope: text('scope').notNull(),
    event: text('event').notNull(),
    detail: text('detail'), // JSON
    itemId: text('itemId'),
    source: text('source'),
    userId: text('userId'),
    durationMs: integer('durationMs'),
    errorStack: text('errorStack'),
  },
  (table) => ({
    tsIdx: index('idx_audit_ts').on(table.ts),
    scopeIdx: index('idx_audit_scope').on(table.scope),
    levelIdx: index('idx_audit_level').on(table.level),
    eventIdx: index('idx_audit_event').on(table.event),
    itemIdx: index('idx_audit_item').on(table.itemId),
  })
);

// ============================================================================
// USER_PREFERENCES: Per-user configuration
// ============================================================================
export const userPreferences = sqliteTable('user_preferences', {
  userId: text('userId').primaryKey(),
  preferences: text('preferences').notNull(), // JSON
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updatedAt')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================================
// DIGEST_HISTORY: Track sent email digests
// ============================================================================
export const digestHistory = sqliteTable(
  'digest_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('userId').notNull(),
    sentAt: text('sentAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    itemCount: integer('itemCount').notNull(),
    emailHash: text('emailHash').notNull(),
    status: text('status').notNull(), // sent | failed | bounced
    detail: text('detail'), // JSON
  },
  (table) => ({
    userIdx: index('idx_digest_user').on(table.userId),
    sentIdx: index('idx_digest_sent').on(table.sentAt),
  })
);

// ============================================================================
// HEALTH_CHECKS: Connector health monitoring
// ============================================================================
export const healthChecks = sqliteTable(
  'health_checks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: integer('sourceId')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    sourceName: text('sourceName').notNull(),
    sourceType: text('sourceType').notNull(),
    status: text('status').notNull(), // healthy | degraded | failed
    responseTime: integer('responseTime'),
    errorMessage: text('errorMessage'),
    errorStack: text('errorStack'),
    checkedAt: text('checkedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    metadata: text('metadata'), // JSON
  },
  (table) => ({
    sourceIdx: index('idx_health_checks_source').on(table.sourceId, table.checkedAt),
    latestIdx: index('idx_health_checks_latest').on(table.sourceType, table.checkedAt),
  })
);

// ============================================================================
// TEST_PROFILES: Test definitions and metadata
// ============================================================================
export const testProfiles = sqliteTable('test_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  features: text('features'),
  possibleErrorsWResolutions: text('possible_errors_w_resolutions'), // JSON
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================================
// TEST_RESULTS: Individual test run results
// ============================================================================
export const testResults = sqliteTable(
  'test_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    testProfileId: integer('test_profile_id')
      .notNull()
      .references(() => testProfiles.id),
    testSessionId: text('test_session_id').notNull(),
    timestamp: text('timestamp')
      .notNull()
      .default(sql`(datetime('now'))`),
    status: text('status').notNull(), // PASS | FAIL | ERROR
    rawErrorMessage: text('raw_error_message'),
    humanReadableErrorMessage: text('human_readable_error_message'),
    possibleSolutions: text('possible_solutions'),
    latencyMs: integer('latency_ms'),
    logs: text('logs'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    sessionIdx: index('idx_test_results_session').on(table.testSessionId),
    statusIdx: index('idx_test_results_status').on(table.status),
  })
);

// ============================================================================
// AI_LOGS: AI model execution logs
// ============================================================================
export const aiLogs = sqliteTable(
  'ai_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    testResultId: integer('test_result_id')
      .notNull()
      .references(() => testResults.id),
    model: text('model'),
    provider: text('provider'),
    prompt: text('prompt'),
    responseJson: text('response_json'),
    reasoningSummary: text('reasoning_summary'),
    tokenUsage: integer('token_usage'),
    latencyMs: integer('latency_ms'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    resultIdx: index('idx_ai_logs_result_id').on(table.testResultId),
  })
);

// ============================================================================
// BADGES: Normalized tags/categories for items
// ============================================================================
export const badges = sqliteTable(
  'badges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    description: text('description'),
    color: text('color'), // hex color for UI
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    nameIdx: index('idx_badges_name').on(table.name),
  })
);

// ============================================================================
// ENTRY_BADGES: Many-to-many relationship between items and badges
// ============================================================================
export const entryBadges = sqliteTable(
  'entry_badges',
  {
    entryId: text('entry_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    badgeId: integer('badge_id')
      .notNull()
      .references(() => badges.id, { onDelete: 'cascade' }),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    pk: index('pk_entry_badges').on(table.entryId, table.badgeId),
    entryIdx: index('idx_entry_badges_entry').on(table.entryId),
    badgeIdx: index('idx_entry_badges_badge').on(table.badgeId),
  })
);
