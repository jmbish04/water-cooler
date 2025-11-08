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
import { getSources } from '../services/db';

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
      return this.triggerScan();
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
    const logger = createLogger(this.env.DB, 'SchedulerActor');
    const start = Date.now();

    try {
      // Broadcast scan start
      this.broadcastLog({
        type: 'scan_started',
        message: 'Starting scheduled scan of all enabled sources',
        timestamp: new Date().toISOString(),
        level: 'info',
      });

      // Step 1 - Fetch enabled sources
      const sources = await getSources(this.env.DB, true);

      this.broadcastLog({
        type: 'sources_loaded',
        message: `Found ${sources.length} enabled sources to scan`,
        timestamp: new Date().toISOString(),
        level: 'info',
      });

      // Step 2 - Enqueue scans
      for (const source of sources) {
        this.broadcastLog({
          type: 'source_enqueuing',
          message: `Enqueuing scan for ${source.name}`,
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
        });

        await logger.info('SCAN_ENQUEUED', {
          sourceId: source.id,
          source: source.type,
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

      // Step 3 - Schedule next alarm (6 hours)
      const nextAlarm = Date.now() + 6 * 60 * 60 * 1000;
      await this.state.storage.setAlarm(nextAlarm);

      // Step 4 - Update state
      await this.state.storage.put('lastRun', new Date().toISOString());

      await logger.info('SCHEDULER_COMPLETED', {
        sourcesScanned: sources.length,
        durationMs: Date.now() - start,
      });

      this.broadcastLog({
        type: 'scan_completed',
        message: `Scan completed successfully. Enqueued ${sources.length} sources in ${Date.now() - start}ms`,
        timestamp: new Date().toISOString(),
        level: 'success',
      });
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
    }
  }

  /**
   * Trigger immediate scan
   */
  private async triggerScan(): Promise<Response> {
    const logger = createLogger(this.env.DB, 'SchedulerActor');

    try {
      // Run scan immediately
      await this.alarm();

      return new Response(
        JSON.stringify({ success: true, message: 'Scan triggered' }),
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
