/**
 * Health Check Service
 *
 * Purpose:
 * - Test connectivity to external APIs (GitHub, Reddit, Discord, App Store)
 * - Store health check results in D1
 * - Provide health status API
 */

import { Source } from '../types/domain';
import { createLogger } from '../utils/logger';

export interface HealthCheckResult {
  sourceId: number;
  sourceName: string;
  sourceType: string;
  status: 'healthy' | 'degraded' | 'failed';
  responseTime: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Run health check for a source
 */
export async function checkSourceHealth(
  source: Source,
  env: {
    GITHUB_TOKEN?: string;
    REDDIT_CLIENT_ID?: string;
    REDDIT_CLIENT_SECRET?: string;
    REDDIT_REFRESH_TOKEN?: string;
    DISCORD_BOT_TOKEN?: string;
  }
): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    switch (source.type) {
      case 'github':
        return await checkGitHubHealth(source, env.GITHUB_TOKEN, start);
      case 'reddit':
        return await checkRedditHealth(source, env, start);
      case 'discord':
        return await checkDiscordHealth(source, env.DISCORD_BOT_TOKEN, start);
      case 'appstore':
        return await checkAppStoreHealth(source, start);
      default:
        throw new Error(`Unknown source type: ${source.type}`);
    }
  } catch (error) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      status: 'failed',
      responseTime: Date.now() - start,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack || null : null,
      metadata: null,
    };
  }
}

/**
 * Check GitHub API health
 */
async function checkGitHubHealth(
  source: Source,
  token: string | undefined,
  start: number
): Promise<HealthCheckResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Cloudflare-Curation-Hub',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Test GitHub API rate limit endpoint
  const response = await fetch('https://api.github.com/rate_limit', {
    headers,
  });

  const responseTime = Date.now() - start;

  if (!response.ok) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      status: 'failed',
      responseTime,
      errorMessage: `GitHub API returned ${response.status}`,
      errorStack: null,
      metadata: { statusCode: response.status },
    };
  }

  const data = await response.json<{
    rate: { limit: number; remaining: number; reset: number };
  }>();

  const remaining = data.rate.remaining;
  const limit = data.rate.limit;
  const percentRemaining = (remaining / limit) * 100;

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type,
    status: percentRemaining < 10 ? 'degraded' : 'healthy',
    responseTime,
    errorMessage: percentRemaining < 10 ? 'API rate limit low' : null,
    errorStack: null,
    metadata: {
      rateLimit: limit,
      rateLimitRemaining: remaining,
      rateLimitReset: new Date(data.rate.reset * 1000).toISOString(),
    },
  };
}

/**
 * Check Reddit API health
 */
async function checkRedditHealth(
  source: Source,
  env: {
    REDDIT_CLIENT_ID?: string;
    REDDIT_CLIENT_SECRET?: string;
    REDDIT_REFRESH_TOKEN?: string;
  },
  start: number
): Promise<HealthCheckResult> {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      status: 'degraded',
      responseTime: null,
      errorMessage: 'Reddit credentials not configured',
      errorStack: null,
      metadata: null,
    };
  }

  // Try to fetch from a public subreddit (no auth needed)
  const response = await fetch('https://www.reddit.com/r/announcements/hot.json?limit=1', {
    headers: {
      'User-Agent': 'Cloudflare-Curation-Hub/1.0',
    },
  });

  const responseTime = Date.now() - start;

  if (!response.ok) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      status: 'failed',
      responseTime,
      errorMessage: `Reddit API returned ${response.status}`,
      errorStack: null,
      metadata: { statusCode: response.status },
    };
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type,
    status: 'healthy',
    responseTime,
    errorMessage: null,
    errorStack: null,
    metadata: null,
  };
}

/**
 * Check Discord API health
 */
async function checkDiscordHealth(
  source: Source,
  token: string | undefined,
  start: number
): Promise<HealthCheckResult> {
  if (!token) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      status: 'degraded',
      responseTime: null,
      errorMessage: 'Discord bot token not configured',
      errorStack: null,
      metadata: null,
    };
  }

  // Test Discord API gateway endpoint
  const response = await fetch('https://discord.com/api/v10/gateway', {
    headers: {
      Authorization: `Bot ${token}`,
    },
  });

  const responseTime = Date.now() - start;

  if (!response.ok) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      status: 'failed',
      responseTime,
      errorMessage: `Discord API returned ${response.status}`,
      errorStack: null,
      metadata: { statusCode: response.status },
    };
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type,
    status: 'healthy',
    responseTime,
    errorMessage: null,
    errorStack: null,
    metadata: null,
  };
}

/**
 * Check App Store API health
 */
async function checkAppStoreHealth(
  source: Source,
  start: number
): Promise<HealthCheckResult> {
  // Test iTunes Search API with a simple query
  const response = await fetch(
    'https://itunes.apple.com/search?term=test&limit=1&entity=software'
  );

  const responseTime = Date.now() - start;

  if (!response.ok) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      status: 'failed',
      responseTime,
      errorMessage: `App Store API returned ${response.status}`,
      errorStack: null,
      metadata: { statusCode: response.status },
    };
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type,
    status: 'healthy',
    responseTime,
    errorMessage: null,
    errorStack: null,
    metadata: null,
  };
}

/**
 * Store health check result in D1
 */
export async function storeHealthCheck(
  db: D1Database,
  result: HealthCheckResult
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO health_checks
       (sourceId, sourceName, sourceType, status, responseTime, errorMessage, errorStack, checkedAt, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      result.sourceId,
      result.sourceName,
      result.sourceType,
      result.status,
      result.responseTime,
      result.errorMessage,
      result.errorStack,
      now,
      result.metadata ? JSON.stringify(result.metadata) : null
    )
    .run();
}

/**
 * Get latest health check for a source
 */
export async function getLatestHealthCheck(
  db: D1Database,
  sourceId: number
): Promise<HealthCheckResult | null> {
  const result = await db
    .prepare(
      `SELECT * FROM health_checks
       WHERE sourceId = ?
       ORDER BY checkedAt DESC
       LIMIT 1`
    )
    .bind(sourceId)
    .first();

  if (!result) return null;

  return {
    sourceId: result.sourceId as number,
    sourceName: result.sourceName as string,
    sourceType: result.sourceType as string,
    status: result.status as 'healthy' | 'degraded' | 'failed',
    responseTime: result.responseTime as number | null,
    errorMessage: result.errorMessage as string | null,
    errorStack: result.errorStack as string | null,
    metadata: result.metadata ? JSON.parse(result.metadata as string) : null,
  };
}

/**
 * Get all latest health checks (one per source)
 */
export async function getAllLatestHealthChecks(
  db: D1Database
): Promise<HealthCheckResult[]> {
  const result = await db
    .prepare(
      `SELECT hc.* FROM health_checks hc
       INNER JOIN (
         SELECT sourceId, MAX(checkedAt) as maxCheckedAt
         FROM health_checks
         GROUP BY sourceId
       ) latest ON hc.sourceId = latest.sourceId AND hc.checkedAt = latest.maxCheckedAt
       ORDER BY hc.sourceType, hc.sourceName`
    )
    .all();

  return (result.results || []).map((row) => ({
    sourceId: row.sourceId as number,
    sourceName: row.sourceName as string,
    sourceType: row.sourceType as string,
    status: row.status as 'healthy' | 'degraded' | 'failed',
    responseTime: row.responseTime as number | null,
    errorMessage: row.errorMessage as string | null,
    errorStack: row.errorStack as string | null,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  }));
}
