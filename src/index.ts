/**
 * AI-Curated Discovery Hub — Main Entry Point
 *
 * Purpose:
 * - Hono application with API routes and static asset serving
 * - Exports Durable Object classes for Cloudflare Workers
 * - Handles queue consumers for async scanning
 * - Serves React frontend from /public via assets binding
 *
 * AI Agent Hints:
 * - All routes under /api
 * - Static assets (React app) served from /public
 * - No inline HTML/JS — all UI is static files
 * - OpenAPI spec at /openapi.json and /openapi.yaml
 * - Health check at /health
 *
 * Architecture:
 * - Hono for routing and middleware
 * - Durable Objects for stateful actors
 * - Vectorize for semantic search
 * - D1 for relational data
 * - AI binding for curation and Q&A
 */

import { Hono } from 'hono';
import { Env, validateEnv } from './types/env';
import { corsMiddleware, requestLogger, errorHandler } from './router/middleware';
import apiRoutes from './router/api';
import openapiRoutes from './router/openapi';

// Export Durable Object classes
export { SchedulerActor } from './actors/SchedulerActor';
export { CuratorActor } from './actors/CuratorActor';
export { GitHubActor } from './actors/GitHubActor';
export { AppStoreActor } from './actors/AppStoreActor';
export { RedditActor } from './actors/RedditActor';
export { DiscordActor } from './actors/DiscordActor';
export { IgduxActor } from './actors/IgduxActor';
export { UserSessionActor } from './actors/UserSessionActor';

/**
 * Main Hono application
 */
const app = new Hono<{ Bindings: Env }>();

/**
 * Global middleware
 */
app.use('*', corsMiddleware);
app.use('*', errorHandler);
app.use('/api/*', requestLogger);

/**
 * Health check
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

/**
 * API routes
 */
app.route('/api', apiRoutes);

/**
 * OpenAPI routes
 */
app.route('/', openapiRoutes);

/**
 * WebSocket route for real-time scan logs
 */
app.get('/scheduler', async (c) => {
  // Check if this is a WebSocket upgrade request
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  // Get scheduler actor
  const schedulerId = c.env.SCHEDULER_ACTOR.idFromName('scheduler');
  const schedulerStub = c.env.SCHEDULER_ACTOR.get(schedulerId);

  // Forward the WebSocket upgrade request to the actor
  return schedulerStub.fetch(c.req.raw);
});

/**
 * Static assets (React frontend)
 *
 * Serve all static files from /public directory
 * Built by Vite from /ui source
 */
app.get('/*', async (c) => {
  // Use assets binding to serve static files
  const url = new URL(c.req.url);
  const assetResponse = await c.env.ASSETS.fetch(url.toString());

  // If asset found, return it
  if (assetResponse.status === 200) {
    return assetResponse;
  }

  // Fallback to index.html for SPA routing
  const indexUrl = new URL(url);
  indexUrl.pathname = '/index.html';
  return c.env.ASSETS.fetch(indexUrl.toString());
});

/**
 * Queue consumer for scan queue
 *
 * Processes scan messages from SCAN_QUEUE
 * Routes to appropriate source actor
 */
// ---- REMOVED 'export' KEYWORD ----
async function queue(
  batch: MessageBatch,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const payload = message.body as {
        type: 'scan';
        sourceId: number;
        source: string;
        config: any;
      };

      if (payload.type === 'scan') {
        // Route to appropriate actor
        let actorBinding: DurableObjectNamespace;
        switch (payload.source) {
          case 'github':
            actorBinding = env.GITHUB_ACTOR;
            break;
          case 'appstore':
            actorBinding = env.APPSTORE_ACTOR;
            break;
          case 'reddit':
            actorBinding = env.REDDIT_ACTOR;
            break;
          case 'discord':
            actorBinding = env.DISCORD_ACTOR;
            break;
          case 'igdux':
            actorBinding = env.IGDUX_ACTOR;
            break;
          default:
            console.error(`Unknown source type: ${payload.source}`);
            continue;
        }

        // Get actor stub and trigger scan
        const actorId = actorBinding.idFromName(`source-${payload.sourceId}`);
        const actorStub = actorBinding.get(actorId);

        await actorStub.fetch('http://actor/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: payload.sourceId,
            config: payload.config,
          }),
        });
      }

      // Ack message
      message.ack();
    } catch (error) {
      console.error('[QUEUE_CONSUMER_ERROR]', error);
      // Retry by not acking
      message.retry();
    }
  }
}

// Scheduled handler (cron triggers)
//
// Runs workflows on schedule:
// - Cron "0 */6 * * *" (every 6 hours) — scheduleScan
// - Cron "0 9 * * *" (9am daily) — dailyDigest
// - Cron "0 0 * * *" (midnight daily) — health checks
// ---- REMOVED 'export' KEYWORD ----
async function scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const cron = event.cron;

  // Every 6 hours — trigger scan workflow
  if (cron === '0 */6 * * *') {
    const schedulerId = env.SCHEDULER_ACTOR.idFromName('scheduler');
    const schedulerStub = env.SCHEDULER_ACTOR.get(schedulerId);

    ctx.waitUntil(
      schedulerStub.fetch('http://scheduler/trigger', {
        method: 'POST',
      })
    );
  }

  // 9am daily — trigger digest workflow
  if (cron === '0 9 * * *') {
    const { dailyDigestWorkflow } = await import('./workflows/dailyDigest');
    ctx.waitUntil(dailyDigestWorkflow(env));
  }

  // Midnight daily — run health checks on all connectors
  if (cron === '0 0 * * *') {
    const { runDailyHealthChecks } = await import('./workflows/healthCheck');
    ctx.waitUntil(runDailyHealthChecks(env));
  }
}

/**
 * Default export (fetch handler)
 */
// ---- MODIFIED DEFAULT EXPORT ----
export default {
  fetch: app.fetch,
  queue: queue,
  scheduled: scheduled
};
