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
  options: DigestOptions,
  sourceMap: Map<number, string> // <-- Accept sourceMap
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
    const grouped = groupBySource(topItems, sourceMap); // <-- Pass map

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
      from: 'digest@curation-hub.workers.dev', // TODO: Update this to your sending email
      to: userEmail,
      subject: `Your AI-Curated Digest — ${topItems.length} New Items`,
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
function groupBySource(items: Item[], sourceMap: Map<number, string>): Record<string, Item[]> {
  const grouped: Record<string, Item[]> = {};

  items.forEach((item) => {
    // Use the sourceMap to get the friendly name
    const key = sourceMap.get(item.sourceId) || `Source ${item.sourceId}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  });

  return grouped;
}

/**
 * Render HTML email template (Gmail-optimized)
 */
function renderDigestHTML(grouped: Record<string, Item[]>): string {
  const sections = Object.entries(grouped)
    .map(([sourceName, items]) => {
      const itemsHtml = items
        .map(
          (item) => `
        <!-- ITEM -->
        <tr>
          <td style="padding: 20px; background-color: #f9f9f9; border-left: 4px solid #4CAF50; border-radius: 4px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <h3 style="margin: 0 0 10px 0; font-family: Arial, sans-serif; font-size: 18px; font-weight: 600; color: #333333;">
                    <a href="${item.url}" target="_blank" style="color: #1976D2; text-decoration: none;">${item.title}</a>
                  </h3>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom: 15px; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #555555;">
                  ${item.summary || 'No summary available.'}
                </td>
              </tr>
              <tr>
                <td style="padding-bottom: 15px;">
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-family: Arial, sans-serif; font-size: 12px; color: #777777;">
                        <strong>Score:</strong> ${Math.round(item.score * 100)}%
                      </td>
                      <td style="padding: 0 10px; font-family: Arial, sans-serif; font-size: 12px; color: #aaaaaa;">|</td>
                      <td style="font-family: Arial, sans-serif; font-size: 12px; color: #777777;">
                        <strong>Tags:</strong> ${item.tags?.join(', ') || 'None'}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ${item.reason ? `
              <tr>
                <td style="font-family: Arial, sans-serif; font-size: 13px; color: #666666; font-style: italic; border-top: 1px dashed #cccccc; padding-top: 10px;">
                  " ${item.reason} "
                </td>
              </tr>
              ` : ''}
            </table>
          </td>
        </tr>
        <!-- SPACER -->
        <tr><td style="font-size: 0; line-height: 0;" height="20">&nbsp;</td></tr>
      `
        )
        .join('');

      return `
      <!-- SECTION HEADER -->
      <tr>
        <td style="padding-bottom: 10px;">
          <h2 style="margin: 0; font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; color: #333333; border-bottom: 2px solid #eeeeee; padding-bottom: 10px;">
            ${sourceName}
          </h2>
        </td>
      </tr>
      <!-- SPACER -->
      <tr><td style="font-size: 0; line-height: 0;" height="10">&nbsp;</td></tr>
      
      <!-- ITEMS LIST -->
      <tr>
        <td>
          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            ${itemsHtml}
          </table>
        </td>
      </tr>
      <!-- SECTION SPACER -->
      <tr><td style="font-size: 0; line-height: 0;" height="30">&nbsp;</td></tr>
    `;
    })
    .join('');

  // The main email template
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your AI-Curated Digest</title>
  <!--[if mso]>
  <style type="text/css">
    table {border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
    td {border-collapse:collapse;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          
          <!-- HEADER -->
          <tr>
            <td align="center" style="padding: 30px 20px; border-bottom: 1px solid #eeeeee;">
              <h1 style="margin: 0; font-family: Arial, sans-serif; font-size: 28px; font-weight: bold; color: #1976D2;">
                🤖 AI-Curated Digest
              </h1>
              <p style="margin: 10px 0 0 0; font-family: Arial, sans-serif; font-size: 16px; color: #666666;">
                Your daily roundup of top-scoring items.
              </p>
            </td>
          </tr>

          <!-- SPACER -->
          <tr><td style="font-size: 0; line-height: 0;" height="30">&nbsp;</td></tr>

          <!-- CONTENT BODY -->
          <tr>
            <td style="padding: 0 30px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${sections}
              </table>
            </td>
          </tr>

          <!-- SPACER -->
          <tr><td style="font-size: 0; line-height: 0;" height="20">&nbsp;</td></tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding: 30px 20px; border-top: 1px solid #eeeeee; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 15px;">
                    <a href="https://curation-hub.workers.dev" target="_blank" style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none; background-color: #1976D2; padding: 12px 25px; border-radius: 5px; display: inline-block;">
                      Go to Your Dashboard
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: Arial, sans-serif; font-size: 12px; color: #999999;">
                    <p style="margin: 0;">Powered by Cloudflare Workers + AI</p>
                    <p style="margin: 5px 0 0 0;">
                      <a href="https://curation-hub.workers.dev/settings" target="_blank" style="color: #999999; text-decoration: underline;">Manage Preferences</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
