/**
 * Health Check Workflow
 *
 * Runs daily health checks on all connectors and stores results in D1
 */

import { Env } from '../types/env';
import { getSources } from '../services/db';
import { checkSourceHealth, storeHealthCheck } from '../services/health';
import { createLogger } from '../utils/logger';

/**
 * Run daily health checks on all enabled sources
 */
export async function runDailyHealthChecks(env: Env): Promise<void> {
  const logger = createLogger(env.DB, 'HealthCheckWorkflow');
  const start = Date.now();

  try {
    await logger.info('HEALTH_CHECK_STARTED', {});

    // Get all enabled sources
    const sources = await getSources(env.DB, true);

    let successCount = 0;
    let failureCount = 0;

    // Run health check for each source
    for (const source of sources) {
      try {
        const result = await checkSourceHealth(source, {
          GITHUB_TOKEN: env.GITHUB_TOKEN,
          REDDIT_CLIENT_ID: env.REDDIT_CLIENT_ID,
          REDDIT_CLIENT_SECRET: env.REDDIT_CLIENT_SECRET,
          REDDIT_REFRESH_TOKEN: env.REDDIT_REFRESH_TOKEN,
          DISCORD_BOT_TOKEN: env.DISCORD_BOT_TOKEN,
        });

        // Store result in D1
        await storeHealthCheck(env.DB, result);

        if (result.status === 'healthy') {
          successCount++;
        } else {
          failureCount++;
        }

        await logger.info('SOURCE_HEALTH_CHECKED', {
          sourceId: source.id,
          sourceName: source.name,
          status: result.status,
          responseTime: result.responseTime,
        });
      } catch (error) {
        await logger.error('SOURCE_HEALTH_CHECK_FAILED', error, {
          sourceId: source.id,
          sourceName: source.name,
        });
        failureCount++;
      }
    }

    await logger.info('HEALTH_CHECK_COMPLETED', {
      totalSources: sources.length,
      successCount,
      failureCount,
      durationMs: Date.now() - start,
    });
  } catch (error) {
    await logger.error('HEALTH_CHECK_WORKFLOW_FAILED', error, {
      durationMs: Date.now() - start,
    });
  }
}
