/**
 * Scheduler Actor (Durable Object)
 *
 * Purpose:
 * - Coordinate periodic scans of all enabled sources
 * - Trigger scan workflows/queues every 6 hours
 * - Track last scan time per source
 * - Provide manual trigger endpoint
 *
 * AI Agent Hints:
 * - Single global instance (ID: "scheduler")
 * - Uses Alarms for periodic execution
 * - Enqueues messages to SCAN_QUEUE for each source
 * - Logs all scheduling events to audit_logs
 *
 * Endpoints:
 * - POST /trigger - Force immediate scan
 * - GET /status - Get scheduler state
 */

import { Env } from '../types/env';
import { createLogger } from '../utils/logger';
import { getSources, getSourceById } from '../services/db';

export class SchedulerActor implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private websockets: Set<WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.websockets = new Set();
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade request
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    if (request.method === 'POST' && url.pathname === '/trigger') {
      let options: { sourceId?: number; force?: boolean; startDate?: string; endDate?: string } = {};
      try {
        const body = await request.clone().json();
        if (body && typeof body === 'object') {
          options = {
            sourceId: typeof body.sourceId === 'number' ? body.sourceId : undefined,
            force: body.force === undefined ? undefined : Boolean(body.force),
            startDate: typeof body.startDate === 'string' ? body.startDate : undefined,
            endDate: typeof body.endDate === 'string' ? body.endDate : undefined,
          };
        }
      } catch {
        // Ignore parse errors; default options will be used
      }

      return this.triggerScan(options);
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return this.getStatus();
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Handle WebSocket connection
   */
  private async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    server.accept();

    // Store the WebSocket connection
    this.websockets.add(server);

    // Send initial connection message
    server.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to scan log stream',
      timestamp: new Date().toISOString(),
    }));

    // Handle WebSocket events
    server.addEventListener('close', () => {
      this.websockets.delete(server);
    });

    server.addEventListener('error', () => {
      this.websockets.delete(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  private broadcastLog(log: {
    type: string;
    message: string;
    sourceId?: number;
    sourceName?: string;
    timestamp: string;
    level?: 'info' | 'error' | 'success';
  }): void {
    const message = JSON.stringify(log);
    for (const ws of this.websockets) {
      try {
        ws.send(message);
      } catch (error) {
        // Remove failed connections
        this.websockets.delete(ws);
      }
    }
  }

  /**
   * Alarm handler - runs every 6 hours
   *
   * Step 1 - Fetch all enabled sources
   * Step 2 - Enqueue scan message for each source
   * Step 3 - Schedule next alarm
   * Step 4 - Log completion
   */
  async alarm(): Promise<void> {
    try {
      await this.runScan();
    } catch {
      // runScan handles its own logging/broadcasting on failure
    } finally {
      const nextAlarm = Date.now() + 6 * 60 * 60 * 1000;
      await this.state.storage.setAlarm(nextAlarm);
    }
  }

  /**
   * Trigger immediate scan
   */
  private async triggerScan(options: {
    sourceId?: number;
    force?: boolean;
    startDate?: string;
    endDate?: string;
  }): Promise<Response> {
    const logger = createLogger(this.env.DB, 'SchedulerActor');

    try {
      const result = await this.runScan(options);

      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      await logger.error('TRIGGER_FAILED', error);
      return new Response(
        JSON.stringify({ error: 'Failed to trigger scan' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  private async runScan(options: {
    sourceId?: number;
    force?: boolean;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const logger = createLogger(this.env.DB, 'SchedulerActor');
    const start = Date.now();
    const force = Boolean(options.force);
    const { startDate, endDate } = options;
    const rangeLabel = startDate || endDate ? ` (range ${startDate || '…'} → ${endDate || '…'})` : '';

    try {
      this.broadcastLog({
        type: 'scan_started',
        message: options.sourceId
          ? `Starting scan for source ${options.sourceId}${force ? ' (force)' : ''}${rangeLabel}`
          : `Starting scan of all enabled sources${force ? ' (force)' : ''}${rangeLabel}`,
        timestamp: new Date().toISOString(),
        level: 'info',
      });

      let sources;
      if (options.sourceId !== undefined) {
        const source = await getSourceById(this.env.DB, options.sourceId);
        if (!source) {
          throw new Error(`Source ${options.sourceId} not found`);
        }
        sources = [source];
      } else {
        sources = await getSources(this.env.DB, true);
      }

      if (sources.length === 0) {
        await logger.warn('NO_SOURCES_TO_SCAN');
        this.broadcastLog({
          type: 'scan_skipped',
          message: 'No sources available to scan',
          timestamp: new Date().toISOString(),
          level: 'info',
        });
        return { sourcesScanned: 0, force, durationMs: Date.now() - start };
      }

      this.broadcastLog({
        type: 'sources_loaded',
        message: `Preparing ${sources.length} source(s)${force ? ' with force reprocess' : ''}${rangeLabel}`,
        timestamp: new Date().toISOString(),
        level: 'info',
      });

      for (const source of sources) {
        this.broadcastLog({
          type: 'source_enqueuing',
          message: `Enqueuing scan for ${source.name}${force ? ' (force)' : ''}${rangeLabel}`,
          sourceId: source.id,
          sourceName: source.name,
          timestamp: new Date().toISOString(),
          level: 'info',
        });

        await this.env.SCAN_QUEUE.send({
          type: 'scan',
          sourceId: source.id,
          source: source.type,
          config: source.config,
          triggeredAt: new Date().toISOString(),
          force,
          startDate,
          endDate,
        });

        await logger.info('SCAN_ENQUEUED', {
          sourceId: source.id,
          source: source.type,
          force,
          startDate,
          endDate,
        });

        this.broadcastLog({
          type: 'source_enqueued',
          message: `Successfully enqueued ${source.name}`,
          sourceId: source.id,
          sourceName: source.name,
          timestamp: new Date().toISOString(),
          level: 'success',
        });
      }

      await this.state.storage.put('lastRun', new Date().toISOString());

      await logger.info('SCHEDULER_COMPLETED', {
        sourcesScanned: sources.length,
        force,
        startDate,
        endDate,
        durationMs: Date.now() - start,
      });

      this.broadcastLog({
        type: 'scan_completed',
        message: `Scan completed. Enqueued ${sources.length} source(s) in ${Date.now() - start}ms`,
        timestamp: new Date().toISOString(),
        level: 'success',
      });

      return { sourcesScanned: sources.length, force, startDate, endDate, durationMs: Date.now() - start };
    } catch (error) {
      await logger.error('SCHEDULER_FAILED', error, {
        durationMs: Date.now() - start,
      });

      this.broadcastLog({
        type: 'scan_failed',
        message: `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
        level: 'error',
      });

      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  private async getStatus(): Promise<Response> {
    const lastRun = await this.state.storage.get<string>('lastRun');
    const nextAlarm = await this.state.storage.getAlarm();

    return new Response(
      JSON.stringify({
        lastRun,
        nextAlarm: nextAlarm ? new Date(nextAlarm).toISOString() : null,
        active: nextAlarm !== null,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}
