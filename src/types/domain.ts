/**
 * Domain Types for AI-Curated Discovery Hub
 *
 * Purpose:
 * - Core business entities (Item, Source, Action, etc.)
 * - Shared across actors, services, and routes
 * - Strongly typed to prevent runtime errors
 *
 * AI Agent Hints:
 * - All dates are ISO 8601 strings (SQLite datetime format)
 * - Item.id is deterministic hash (SHA-256) of source+url
 * - vectorId links to Vectorize index
 * - Metadata is JSON-serialized for flexibility
 */

/**
 * Source Types
 */
export type SourceType = 'github' | 'appstore' | 'reddit' | 'discord';

export interface Source {
  id: number;
  name: string;
  type: SourceType;
  config: SourceConfig;
  enabled: boolean;
  lastScan: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SourceConfig =
  | GitHubConfig
  | AppStoreConfig
  | RedditConfig
  | DiscordConfig;

export interface GitHubConfig {
  org?: string;
  repos?: string[];
  trending?: {
    language?: string;
    since?: 'daily' | 'weekly' | 'monthly';
  };
}

export interface AppStoreConfig {
  term?: string;
  category?: string;
  country?: string; // ISO 3166-1 alpha-2
}

export interface RedditConfig {
  subreddit: string; // Use "MY_FEED" to get authenticated user's feed
  sort?: 'hot' | 'new' | 'top' | 'rising';
  timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  includeTerms?: string[];
  excludeTerms?: string[];
}

export interface DiscordConfig {
  guildId: string;
  channelId: string;
  webhookUrl?: string;
}

/**
 * Item (Curated Content)
 */
export interface Item {
  id: string; // SHA-256 hash
  sourceId: number;
  title: string;
  url: string;
  summary: string | null;
  tags: string[] | null;
  reason: string | null;
  score: number;
  aiQuestions: string[] | null; // AI-generated follow-up questions
  vectorId: string | null;
  metadata: ItemMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemMetadata {
  // GitHub-specific
  stars?: number;
  language?: string;
  author?: string;
  description?: string;

  // App Store-specific
  rating?: number;
  ratingCount?: number;
  price?: number;
  developer?: string;

  // Reddit-specific
  upvotes?: number;
  comments?: number;
  subreddit?: string;

  // Discord-specific
  reactions?: Record<string, number>;
  author?: string;
  channelName?: string;

  // Common
  imageUrl?: string;
  publishedAt?: string;
}

/**
 * User Actions
 */
export type ActionType = 'read' | 'star' | 'followup' | 'unstar';

export interface UserAction {
  id: number;
  itemId: string;
  userId: string;
  action: ActionType;
  createdAt: string;
}

/**
 * Audit Logs
 */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface AuditLog {
  id?: number;
  ts: string;
  level: LogLevel;
  scope: string; // actor/service/route name
  event: string; // SCAN_STARTED, FETCH_FAILED, etc.
  detail?: Record<string, unknown>;
  itemId?: string;
  source?: SourceType;
  userId?: string;
  durationMs?: number;
  errorStack?: string;
}

/**
 * User Preferences
 */
export interface UserPreferences {
  userId: string;
  digestFrequency?: 'daily' | 'weekly' | 'never';
  enabledSources?: number[]; // source IDs
  minScore?: number;
  excludeTags?: string[];
  includeTags?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Digest History
 */
export interface DigestHistory {
  id: number;
  userId: string;
  sentAt: string;
  itemCount: number;
  emailHash: string;
  status: 'sent' | 'failed' | 'bounced';
  detail?: Record<string, unknown>;
}

/**
 * Curation Request (for AI processing)
 */
export interface CurationRequest {
  itemId: string;
  source: SourceType;
  title: string;
  content: string; // README, description, post body
  url: string;
  metadata?: Record<string, unknown>;
}

/**
 * Curation Result (from AI)
 */
export interface CurationResult {
  summary: string;
  tags: string[];
  reason: string;
  score: number; // 0.0 - 1.0 (converted from 0-100 AI response)
  questions?: string[]; // AI-generated follow-up questions
  embedding?: number[]; // vector for Vectorize
}

/**
 * Q&A Request/Response
 */
export interface QARequest {
  itemId: string;
  question: string;
  userId?: string;
  includeRelated?: boolean; // use vector search for context
}

export interface QAResponse {
  answer: string;
  citations: string[];
  relatedItems?: Item[];
  model: string;
}

/**
 * Search Query
 */
export interface SearchQuery {
  q?: string; // keyword or semantic query
  source?: SourceType;
  tags?: string[];
  minScore?: number;
  unread?: boolean;
  starred?: boolean;
  followup?: boolean;
  limit?: number;
  offset?: number;
  userId?: string;
}

/**
 * Search Result
 */
export interface SearchResult {
  items: Item[];
  total: number;
  offset: number;
  limit: number;
}
