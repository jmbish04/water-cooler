import { buildRouter } from './router';
import { mcpRoutes } from './mcp';
import { Hono, Context } from 'hono';
import { Env } from './types/env';
import { corsMiddleware, requestLogger, errorHandler } from './router/middleware';
import apiRoutes from './router/api';
import openapiRoutes from './router/openapi';

// Export Durable Object classes
export { SchedulerActor } from './actors/SchedulerActor';
export { CuratorActor } from './actors/CuratorActor';
export { GitHubActor } from './actors/integrations/GitHubActor';
export { AppStoreActor } from './actors/integrations/AppStoreActor';
export { RedditActor } from './actors/integrations/RedditActor';
export { DiscordActor } from './actors/integrations/DiscordActor';
export { IgduxActor } from './actors/integrations/IgduxActor';
export { UserSessionActor } from './actors/UserSessionActor';
export { RoomDO } from './do/RoomDO';

/**
 * Main Hono applications
 */
const app = new Hono<{ Bindings: Env }>();
const multiProtocolApp = buildRouter();

/**
 * Global middleware
 */
app.use('*', corsMiddleware);
app.use('*', errorHandler);
app.use('/api/*', requestLogger);

/**
 * Root + health routes
 */
app.get('/', async (c) => {
  const accept = c.req.header('accept') ?? '';

  if (accept.includes('text/html')) {
    return serveStaticAsset(c, { forceIndex: true });
  }

  return c.json({
    ok: true,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

/**
 * API & documentation routes
 */
app.route('/api', apiRoutes);
app.route('/', openapiRoutes);

/**
 * WebSocket route for real-time scan logs
 */
app.get('/scheduler', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  const schedulerId = c.env.SCHEDULER_ACTOR.idFromName('scheduler');
  const schedulerStub = c.env.SCHEDULER_ACTOR.get(schedulerId);
  return schedulerStub.fetch(c.req.raw);
});

/**
 * Static assets (React frontend)
 */
app.get('/*', (c) => serveStaticAsset(c));

/**
 * Queue consumer for scan queue
 */
async function queue(batch: MessageBatch, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      const payload = message.body as {
        type: 'scan';
        sourceId: number;
        source: string;
        config: any;
        force?: boolean;
        startDate?: string;
        endDate?: string;
      };

      if (payload.type === 'scan') {
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

        const actorId = actorBinding.idFromName(`source-${payload.sourceId}`);
        const actorStub = actorBinding.get(actorId);

        await actorStub.fetch('http://actor/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: payload.sourceId,
            config: payload.config,
            force: payload.force,
            startDate: payload.startDate,
            endDate: payload.endDate,
          }),
        });
      }

      message.ack();
    } catch (error) {
      console.error('[QUEUE_CONSUMER_ERROR]', error);
      message.retry();
    }
  }
}

/**
 * Scheduled handler (cron triggers)
 */
async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const cron = event.cron;

  if (cron === '0 */6 * * *') {
    const schedulerId = env.SCHEDULER_ACTOR.idFromName('scheduler');
    const schedulerStub = env.SCHEDULER_ACTOR.get(schedulerId);

    ctx.waitUntil(
      schedulerStub.fetch('http://scheduler/trigger', {
        method: 'POST',
      }),
    );
  }

  if (cron === '0 9 * * *') {
    const { dailyDigestWorkflow } = await import('./workflows/dailyDigest');
    ctx.waitUntil(dailyDigestWorkflow(env));
  }

  if (cron === '0 0 * * *') {
    const { runDailyHealthChecks } = await import('./workflows/healthCheck');
    ctx.waitUntil(runDailyHealthChecks(env));
  }
}

/**
 * Helper: static asset serving with SPA fallback
 */
async function serveStaticAsset(
  c: Context<{ Bindings: Env }>,
  options?: { forceIndex?: boolean },
): Promise<Response> {
  const url = new URL(c.req.url);

  if (options?.forceIndex) {
    url.pathname = '/index.html';
  }

  const assetResponse = await c.env.ASSETS.fetch(url.toString());
  if (assetResponse.status === 200) {
    return assetResponse;
  }

  const indexUrl = new URL(c.req.url);
  indexUrl.pathname = '/index.html';
  return c.env.ASSETS.fetch(indexUrl.toString());
}

function shouldUseMultiProtocolRoute(pathname: string): boolean {
  if (!pathname) return false;
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return (
    normalized === '/rpc' ||
    normalized === '/ai/annotate' ||
    normalized === '/api/tasks' ||
    normalized === '/api/analyze'
  );
}

async function handleFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
    const projectId = url.searchParams.get('projectId') ?? 'default';
    const id = env.ROOM_DO.idFromName(projectId);
    const stub = env.ROOM_DO.get(id);
    return stub.fetch(request);
  }

  if (url.pathname.startsWith('/mcp/')) {
    if (url.pathname === '/mcp/tools' && request.method === 'GET') {
      const tools = await mcpRoutes.tools();
      return new Response(JSON.stringify(tools), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/mcp/execute' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await mcpRoutes.execute(env, ctx, body);
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response('MCP endpoint not found', { status: 404 });
  }

  if (shouldUseMultiProtocolRoute(url.pathname)) {
    return multiProtocolApp.fetch(request, env, ctx);
  }

  return app.fetch(request, env, ctx);
}

export default {
  fetch: handleFetch,
  queue,
  scheduled,
};
