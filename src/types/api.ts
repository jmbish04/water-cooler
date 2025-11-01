/**
 * API Contract Types & Zod Schemas
 *
 * Purpose:
 * - Runtime validation for all API requests/responses
 * - TypeScript types derived from Zod schemas
 * - OpenAPI spec generation
 *
 * AI Agent Hints:
 * - Use .parse() for strict validation (throws on error)
 * - Use .safeParse() for gentle validation (returns result object)
 * - All schemas export both Zod schema and inferred TS type
 * - Middleware uses these for automatic validation
 */

import { z } from 'zod';

/**
 * Common Schemas
 */
export const SourceTypeSchema = z.enum(['github', 'appstore', 'reddit', 'discord']);
export type SourceTypeAPI = z.infer<typeof SourceTypeSchema>;

export const ActionTypeSchema = z.enum(['read', 'star', 'followup', 'unstar']);
export type ActionTypeAPI = z.infer<typeof ActionTypeSchema>;

export const LogLevelSchema = z.enum(['INFO', 'WARN', 'ERROR']);
export type LogLevelAPI = z.infer<typeof LogLevelSchema>;

/**
 * Item Schemas
 */
export const ItemMetadataSchema = z.object({
  stars: z.number().optional(),
  language: z.string().optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  rating: z.number().optional(),
  ratingCount: z.number().optional(),
  price: z.number().optional(),
  developer: z.string().optional(),
  upvotes: z.number().optional(),
  comments: z.number().optional(),
  subreddit: z.string().optional(),
  reactions: z.record(z.number()).optional(),
  channelName: z.string().optional(),
  imageUrl: z.string().url().optional(),
  publishedAt: z.string().optional(),
});

export const ItemSchema = z.object({
  id: z.string(),
  sourceId: z.number(),
  title: z.string(),
  url: z.string().url(),
  summary: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  reason: z.string().nullable(),
  score: z.number().min(0).max(1),
  vectorId: z.string().nullable(),
  metadata: ItemMetadataSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ItemAPI = z.infer<typeof ItemSchema>;

/**
 * Source Configuration Schemas
 */
export const GitHubConfigSchema = z.object({
  org: z.string().optional(),
  repos: z.array(z.string()).optional(),
  trending: z.object({
    language: z.string().optional(),
    since: z.enum(['daily', 'weekly', 'monthly']).optional(),
  }).optional(),
});

export const AppStoreConfigSchema = z.object({
  term: z.string().optional(),
  category: z.string().optional(),
  country: z.string().length(2).optional(),
});

export const RedditConfigSchema = z.object({
  subreddit: z.string(),
  sort: z.enum(['hot', 'new', 'top', 'rising']).optional(),
  timeframe: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional(),
});

export const DiscordConfigSchema = z.object({
  guildId: z.string(),
  channelId: z.string(),
  webhookUrl: z.string().url().optional(),
});

export const SourceConfigSchema = z.union([
  GitHubConfigSchema,
  AppStoreConfigSchema,
  RedditConfigSchema,
  DiscordConfigSchema,
]);

export const SourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: SourceTypeSchema,
  config: SourceConfigSchema,
  enabled: z.boolean(),
  lastScan: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SourceAPI = z.infer<typeof SourceSchema>;

/**
 * Request Schemas
 */

// GET /api/items
export const GetItemsQuerySchema = z.object({
  source: SourceTypeSchema.optional(),
  unread: z.string().transform(val => val === 'true').optional(),
  starred: z.string().transform(val => val === 'true').optional(),
  followup: z.string().transform(val => val === 'true').optional(),
  minScore: z.string().transform(Number).optional(),
  tags: z.string().transform(val => val.split(',')).optional(),
  limit: z.string().transform(Number).default('50'),
  offset: z.string().transform(Number).default('0'),
});
export type GetItemsQuery = z.infer<typeof GetItemsQuerySchema>;

// GET /api/search
export const SearchQuerySchema = z.object({
  q: z.string().min(1),
  source: SourceTypeSchema.optional(),
  tags: z.string().transform(val => val.split(',')).optional(),
  minScore: z.string().transform(Number).optional(),
  unread: z.string().transform(val => val === 'true').optional(),
  starred: z.string().transform(val => val === 'true').optional(),
  followup: z.string().transform(val => val === 'true').optional(),
  limit: z.string().transform(Number).default('20'),
  offset: z.string().transform(Number).default('0'),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

// POST /api/items/:id/ask
export const AskQuestionBodySchema = z.object({
  question: z.string().min(1).max(500),
  includeRelated: z.boolean().default(false),
});
export type AskQuestionBody = z.infer<typeof AskQuestionBodySchema>;

// POST /api/star/:id
export const StarItemBodySchema = z.object({
  starred: z.boolean(),
});
export type StarItemBody = z.infer<typeof StarItemBodySchema>;

// POST /api/followup/:id
export const FollowupItemBodySchema = z.object({
  followup: z.boolean(),
});
export type FollowupItemBody = z.infer<typeof FollowupItemBodySchema>;

// POST /api/mark-read/:id
export const MarkReadBodySchema = z.object({
  read: z.boolean(),
});
export type MarkReadBody = z.infer<typeof MarkReadBodySchema>;

// POST /api/config
export const UpdateConfigBodySchema = z.object({
  sources: z.array(z.object({
    name: z.string(),
    type: SourceTypeSchema,
    config: SourceConfigSchema,
    enabled: z.boolean().default(true),
  })),
});
export type UpdateConfigBody = z.infer<typeof UpdateConfigBodySchema>;

// POST /api/scan
export const TriggerScanBodySchema = z.object({
  sourceId: z.number().optional(),
  force: z.boolean().default(false),
});
export type TriggerScanBody = z.infer<typeof TriggerScanBodySchema>;

/**
 * Response Schemas
 */
export const SearchResultSchema = z.object({
  items: z.array(ItemSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
});
export type SearchResultAPI = z.infer<typeof SearchResultSchema>;

export const QAResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.string()),
  relatedItems: z.array(ItemSchema).optional(),
  model: z.string(),
});
export type QAResponseAPI = z.infer<typeof QAResponseSchema>;

export const ActionResponseSchema = z.object({
  success: z.boolean(),
  action: ActionTypeSchema,
  itemId: z.string(),
});
export type ActionResponseAPI = z.infer<typeof ActionResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  code: z.number(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorResponseAPI = z.infer<typeof ErrorResponseSchema>;

/**
 * User Preferences Schema
 */
export const UserPreferencesSchema = z.object({
  digestFrequency: z.enum(['daily', 'weekly', 'never']).default('weekly'),
  enabledSources: z.array(z.number()).optional(),
  minScore: z.number().min(0).max(1).default(0.5),
  excludeTags: z.array(z.string()).default([]),
  includeTags: z.array(z.string()).default([]),
});
export type UserPreferencesAPI = z.infer<typeof UserPreferencesSchema>;
