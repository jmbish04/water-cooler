/**
 * Kysely Database Client
 *
 * Type-safe query builder for D1 database operations.
 * All queries should use this instead of raw SQL.
 */

import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';

// ============================================================================
// Database Types
// ============================================================================

export interface SourcesTable {
  id: number;
  name: string;
  type: string;
  config: string | null;
  enabled: 0 | 1;
  lastScan: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemsTable {
  id: string;
  sourceId: number;
  title: string;
  url: string;
  summary: string | null;
  tags: string | null;
  reason: string | null;
  score: number;
  vectorId: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserActionsTable {
  id: number;
  itemId: string;
  userId: string;
  action: string;
  createdAt: string;
}

export interface AuditLogsTable {
  id: number;
  ts: string;
  level: string;
  scope: string;
  event: string;
  detail: string | null;
  itemId: string | null;
  source: string | null;
  userId: string | null;
  durationMs: number | null;
  errorStack: string | null;
}

export interface UserPreferencesTable {
  userId: string;
  preferences: string;
  createdAt: string;
  updatedAt: string;
}

export interface DigestHistoryTable {
  id: number;
  userId: string;
  sentAt: string;
  itemCount: number;
  emailHash: string;
  status: string;
  detail: string | null;
}

export interface HealthChecksTable {
  id: number;
  sourceId: number;
  sourceName: string;
  sourceType: string;
  status: string;
  responseTime: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  checkedAt: string;
  metadata: string | null;
}

export interface TestProfilesTable {
  id: number;
  name: string;
  description: string | null;
  features: string | null;
  possible_errors_w_resolutions: string | null;
  is_active: 0 | 1;
  created_at: string;
}

export interface TestResultsTable {
  id: number;
  test_profile_id: number;
  test_session_id: string;
  timestamp: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  raw_error_message: string | null;
  human_readable_error_message: string | null;
  possible_solutions: string | null;
  latency_ms: number | null;
  logs: string | null;
  created_at: string;
}

export interface AiLogsTable {
  id: number;
  test_result_id: number;
  model: string | null;
  provider: string | null;
  prompt: string | null;
  response_json: string | null;
  reasoning_summary: string | null;
  token_usage: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface Database {
  sources: SourcesTable;
  items: ItemsTable;
  user_actions: UserActionsTable;
  audit_logs: AuditLogsTable;
  user_preferences: UserPreferencesTable;
  digest_history: DigestHistoryTable;
  health_checks: HealthChecksTable;
  test_profiles: TestProfilesTable;
  test_results: TestResultsTable;
  ai_logs: AiLogsTable;
}

// ============================================================================
// Database Instance Factory
// ============================================================================

/**
 * Create a Kysely database instance for D1
 */
export function getDb(database: D1Database): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new D1Dialect({ database }),
  });
}

// ============================================================================
// Helper Functions for JSON Parsing
// ============================================================================

/**
 * Safely parse JSON string, return null if invalid
 */
export function tryParseJson<T = unknown>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify value to JSON, return null if undefined
 */
export function toJsonString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}
