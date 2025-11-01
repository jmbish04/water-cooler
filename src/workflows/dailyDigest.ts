/**
 * Daily Digest Workflow
 *
 * Purpose:
 * - Send daily email digest to all users
 * - Runs at 9am PT via cron trigger
 * - Compiles top items (score >= 0.7) from last 24h
 *
 * AI Agent Hints:
 * - Uses Cloudflare Workflows (Durable Execution)
 * - Fetches users from user_preferences table
 * - Calls digest service for each user
 * - Logs all sends to audit_logs
 *
 * Trigger: Cron schedule "0 9 * * *" (9am daily)
 */

import { Env } from '../types/env';
import { getItems } from '../services/db';
import { sendDigest } from '../services/digest';
import { createLogger } from '../utils/logger';

export async function dailyDigestWorkflow(env: Env): Promise<void> {
  const logger = createLogger(env.DB, 'DailyDigestWorkflow');
  const start = Date.now();

  try {
    // Step 1 - Fetch top items from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await getItems(env.DB, {
      minScore: 0.7,
      limit: 50,
    });

    const items = result.items.filter((item) => item.createdAt > yesterday);

    if (items.length === 0) {
      await logger.info('DIGEST_SKIPPED', {
        reason: 'no_items',
      });
      return;
    }

    // Step 2 - Fetch all users with digest enabled
    // For demo, we'll use a hardcoded list
    // In production, query user_preferences table
    const users = [
      { userId: 'demo-user', email: 'user@example.com' },
    ];

    // Step 3 - Send digest to each user
    for (const user of users) {
      try {
        await sendDigest(env.DB, env.MAILER, items, {
          userId: user.userId,
          userEmail: user.email,
          minScore: 0.7,
          maxItems: 20,
        });

        await logger.info('DIGEST_SENT', {
          userId: user.userId,
          itemCount: items.length,
        });
      } catch (error) {
        await logger.error('DIGEST_SEND_FAILED', error, {
          userId: user.userId,
        });
      }
    }

    await logger.info('WORKFLOW_COMPLETED', {
      usersProcessed: users.length,
      itemsIncluded: items.length,
      durationMs: Date.now() - start,
    });
  } catch (error) {
    await logger.error('WORKFLOW_FAILED', error, {
      durationMs: Date.now() - start,
    });
    throw error;
  }
}
