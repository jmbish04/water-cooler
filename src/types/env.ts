/**
 * Environment & Bindings Type Definitions
 *
 * Purpose:
 * - Strongly typed Cloudflare Workers bindings
 * - Environment variable validation
 * - Type safety for all Worker resources
 *
 * AI Agent Hints:
 * - Env is passed to all Hono handlers and actors
 * - Bindings are configured in wrangler.jsonc
 * - Use this type for all env parameters
 * - D1Database, KVNamespace, etc. from @cloudflare/workers-types
 */

/**
 * Cloudflare Workers Bindings
 */
export interface Env {
  // Variables
  AI_MODEL: string; // Default: @cf/openai/gpt-oss-120b
  ENVIRONMENT: string; // production | staging | development
  GITHUB_TOKEN?: string;
  DISCORD_BOT_TOKEN?: string;

  // D1 Database
  DB: D1Database;

  // KV Cache
  CACHE: KVNamespace;

  // R2 Storage
  R2: R2Bucket;

  // Queue for async scans
  SCAN_QUEUE: Queue;

  // AI Binding
  AI: Ai;

  // Vectorize Index
  VEC: VectorizeIndex;

  // Email Sending
  MAILER: {
    send: (message: EmailMessage) => Promise<void>;
  };

  // Static Assets
  ASSETS: Fetcher;

  // Durable Object Bindings
  SCHEDULER_ACTOR: DurableObjectNamespace;
  GITHUB_ACTOR: DurableObjectNamespace;
  APPSTORE_ACTOR: DurableObjectNamespace;
  REDDIT_ACTOR: DurableObjectNamespace;
  DISCORD_ACTOR: DurableObjectNamespace;
  CURATOR_ACTOR: DurableObjectNamespace;
  USER_SESSION_ACTOR: DurableObjectNamespace;
}

/**
 * Email Message Structure
 */
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Queue Message Types
 */
export interface ScanQueueMessage {
  type: 'scan';
  sourceId: number;
  source: string;
  config: Record<string, unknown>;
  triggeredAt: string;
}

/**
 * Durable Object State Extensions
 */
export interface ActorState {
  id: DurableObjectId;
  storage: DurableObjectStorage;
}

/**
 * Environment Validation
 */
export function validateEnv(env: Env): void {
  const required = [
    'DB',
    'CACHE',
    'R2',
    'SCAN_QUEUE',
    'AI',
    'VEC',
    'MAILER',
    'AI_MODEL',
  ];

  for (const key of required) {
    if (!(key in env) || env[key as keyof Env] === undefined) {
      throw new Error(`Missing required environment binding: ${key}`);
    }
  }
}

/**
 * Get AI Model Name
 */
export function getAIModel(env: Env): string {
  return env.AI_MODEL || '@cf/openai/gpt-oss-120b';
}

/**
 * Check if production environment
 */
export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === 'production';
}
