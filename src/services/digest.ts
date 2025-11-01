/**
 * Email Digest Service
 *
 * Purpose:
 * - Compile top items into HTML email
 * - Send via Cloudflare Email (MAILER binding)
 * - Track sent digests to avoid duplicates
 *
 * AI Agent Hints:
 * - Fetches items with score >= minScore (default 0.7)
 * - Groups by source type
 * - Includes links to Worker UI and original URLs
 * - Logs send attempts to audit_logs
 */

import { Item } from '../types/domain';
import { hashEmailContent } from '../utils/hash';
import { createLogger } from '../utils/logger';

interface DigestOptions {
  minScore?: number;
  maxItems?: number;
  userId: string;
  userEmail: string;
}

/**
 * Generate and send email digest
 *
 * Step 1 - Fetch top items
 * Step 2 - Group by source
 * Step 3 - Render HTML email
 * Step 4 - Check for duplicate digest
 * Step 5 - Send via MAILER
 * Step 6 - Record in digest_history
 */
export async function sendDigest(
  db: D1Database,
  mailer: any,
  items: Item[],
  options: DigestOptions
): Promise<void> {
  const logger = createLogger(db, 'DigestService');
  const start = Date.now();

  try {
    const { minScore = 0.7, maxItems = 20, userId, userEmail } = options;

    // Step 1 - Filter and sort items
    const topItems = items
      .filter((item) => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems);

    if (topItems.length === 0) {
      await logger.info('DIGEST_SKIPPED', { userId, reason: 'no_items' });
      return;
    }

    // Step 2 - Group by source
    const grouped = groupBySource(topItems);

    // Step 3 - Render HTML
    const html = renderDigestHTML(grouped);
    const emailHash = await hashEmailContent(html);

    // Step 4 - Check for duplicate (same content sent recently)
    const recentDuplicate = await db
      .prepare(
        `SELECT id FROM digest_history
         WHERE userId = ? AND emailHash = ? AND sentAt > datetime('now', '-7 days')`
      )
      .bind(userId, emailHash)
      .first();

    if (recentDuplicate) {
      await logger.warn('DIGEST_DUPLICATE', { userId, emailHash });
      return;
    }

    // Step 5 - Send email
    await mailer.send({
      from: 'digest@curation-hub.workers.dev',
      to: userEmail,
      subject: `Your AI-Curated Digest — ${topItems.length} Items`,
      html,
    });

    // Step 6 - Record in history
    await db
      .prepare(
        `INSERT INTO digest_history (userId, sentAt, itemCount, emailHash, status)
         VALUES (?, datetime('now'), ?, ?, 'sent')`
      )
      .bind(userId, topItems.length, emailHash)
      .run();

    await logger.info('DIGEST_SENT', {
      userId,
      itemCount: topItems.length,
      durationMs: Date.now() - start,
    });
  } catch (error) {
    // Record failure
    await db
      .prepare(
        `INSERT INTO digest_history (userId, sentAt, itemCount, emailHash, status, detail)
         VALUES (?, datetime('now'), 0, '', 'failed', ?)`
      )
      .bind(options.userId, JSON.stringify({ error: String(error) }))
      .run();

    await logger.error('DIGEST_FAILED', error, {
      userId: options.userId,
      durationMs: Date.now() - start,
    });

    throw error;
  }
}

/**
 * Group items by source type
 */
function groupBySource(items: Item[]): Record<string, Item[]> {
  const grouped: Record<string, Item[]> = {};

  items.forEach((item) => {
    // We need source type, but items only have sourceId
    // For now, group by sourceId (caller should join with sources table)
    const key = `source-${item.sourceId}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  });

  return grouped;
}

/**
 * Render HTML email template
 */
function renderDigestHTML(grouped: Record<string, Item[]>): string {
  const sections = Object.entries(grouped)
    .map(([source, items]) => {
      const itemsHtml = items
        .map(
          (item) => `
        <div style="margin-bottom: 20px; padding: 15px; border-left: 3px solid #4CAF50; background: #f9f9f9;">
          <h3 style="margin: 0 0 10px 0;">
            <a href="${item.url}" style="color: #1976D2; text-decoration: none;">${item.title}</a>
          </h3>
          <p style="margin: 0 0 10px 0; color: #555;">${item.summary || 'No summary available'}</p>
          <div style="font-size: 0.9em; color: #777;">
            <strong>Score:</strong> ${(item.score * 100).toFixed(0)}% |
            <strong>Tags:</strong> ${item.tags?.join(', ') || 'None'}
          </div>
          ${item.reason ? `<p style="margin: 10px 0 0 0; font-style: italic; color: #666;">${item.reason}</p>` : ''}
        </div>
      `
        )
        .join('');

      return `
      <div style="margin-bottom: 30px;">
        <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
          ${source}
        </h2>
        ${itemsHtml}
      </div>
    `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI-Curated Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #fff;">
  <div style="text-align: center; margin-bottom: 40px;">
    <h1 style="color: #1976D2; margin-bottom: 10px;">🤖 AI-Curated Discovery Hub</h1>
    <p style="color: #666; margin: 0;">Your personalized digest of curated content</p>
  </div>

  ${sections}

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 0.9em;">
    <p>Powered by Cloudflare Workers + AI</p>
    <p>
      <a href="https://curation-hub.workers.dev" style="color: #1976D2; text-decoration: none;">View Dashboard</a> |
      <a href="https://curation-hub.workers.dev/settings" style="color: #1976D2; text-decoration: none;">Manage Preferences</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}
