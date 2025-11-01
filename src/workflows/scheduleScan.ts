/**
 * Schedule Scan Workflow
 *
 * Purpose:
 * - Cloudflare Workflow for periodic source scanning
 * - Triggered every 6 hours by cron or Scheduler Actor
 * - Orchestrates scan across all enabled sources
 *
 * AI Agent Hints:
 * - Uses Cloudflare Workflows (Durable Execution)
 * - Fault-tolerant, can pause/resume
 * - Logs all steps to audit_logs
 *
 * Note: Cloudflare Workflows are in beta. This is a conceptual implementation.
 * For now, the SchedulerActor handles periodic scans via Alarms.
 */

import { Env } from '../types/env';
import { getSources } from '../services/db';
import { createLogger } from '../utils/logger';

export async function scheduleScanWorkflow(env: Env): Promise<void> {
  const logger = createLogger(env.DB, 'ScheduleScanWorkflow');
  const start = Date.now();

  try {
    // Step 1 - Fetch all enabled sources
    const sources = await getSources(env.DB, true);

    await logger.info('WORKFLOW_STARTED', {
      sourcesCount: sources.length,
    });

    // Step 2 - Enqueue scan for each source
    for (const source of sources) {
      await env.SCAN_QUEUE.send({
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
    }

    await logger.info('WORKFLOW_COMPLETED', {
      sourcesCount: sources.length,
      durationMs: Date.now() - start,
    });
  } catch (error) {
    await logger.error('WORKFLOW_FAILED', error, {
      durationMs: Date.now() - start,
    });
    throw error;
  }
}
