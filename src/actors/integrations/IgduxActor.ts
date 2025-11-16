/**
 * Igdux Actor (Durable Object)
 *
 * Purpose:
 * - Fetch posts from Igdux JSON feed (Cloudflare Worker projects collection)
 * - Translate Chinese content to English using Workers AI
 * - Enqueue items for curation
 * - Track processed posts
 *
 * AI Agent Hints:
 * - Igdux feed URL: https://www.igdux.com/feed?format=json
 * - Content is in Chinese, translated to English automatically
 * - Updates regularly with new Cloudflare Worker projects
 */

import { Env } from '../../types/env';
import { fetchIgduxFeed } from '../../integrations/igdux';
import { createLogger } from '../../utils/logger';
import { generateItemId } from '../../utils/hash';
import { updateSourceLastScan } from '../../services/db';

export class IgduxActor implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/scan') {
      return this.scan(request);
    }

    return new Response('Not found', { status: 404 });
  }

  private async scan(request: Request): Promise<Response> {
    const logger = createLogger(this.env.DB, 'IgduxActor');
    const start = Date.now();

    try {
      const { sourceId, force, startDate, endDate } = await request.json<{
        sourceId: number;
        force?: boolean;
        startDate?: string;
        endDate?: string;
      }>();

      // Fetch and translate Igdux feed
      const items = await fetchIgduxFeed(this.env.AI, this.env.CACHE);

      const processed =
        (await this.state.storage.get<Set<string>>('processed')) || new Set();

      const startBoundary = startDate ? new Date(startDate) : undefined;
      const endBoundary = endDate ? new Date(endDate) : undefined;
      const endInclusive = endBoundary ? new Date(endBoundary.getTime() + 24 * 60 * 60 * 1000) : undefined;

      const inRange = (publishedAt?: string | null) => {
        if (!startBoundary && !endBoundary) return true;
        if (!publishedAt) return true;
        const publishedDate = new Date(publishedAt);
        if (Number.isNaN(publishedDate.getTime())) return true;
        if (startBoundary && publishedDate < startBoundary) return false;
        if (endInclusive && publishedDate >= endInclusive) return false;
        return true;
      };

      let newCount = 0;
      for (const item of items) {
        if (!inRange(item.metadata?.publishedAt)) {
          continue;
        }

        if (force || !processed.has(item.url)) {
          const itemId = await generateItemId(sourceId, item.url);
          const curatorId = this.env.CURATOR_ACTOR.idFromName(itemId);
          const curatorStub = this.env.CURATOR_ACTOR.get(curatorId);

          await curatorStub.fetch('http://curator/curate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemId,
              sourceId,
              source: 'igdux',
              title: item.title, // Already translated
              url: item.url,
              content: item.content, // Already translated
              metadata: item.metadata,
            }),
          });

          processed.add(item.url);
          newCount++;
        }
      }

      await this.state.storage.put('processed', processed);

      // Update last scan timestamp
      await updateSourceLastScan(this.env.DB, sourceId);

      await logger.info('IGDUX_SCAN_COMPLETED', {
        sourceId,
        totalItems: items.length,
        newItems: newCount,
        durationMs: Date.now() - start,
      });

      return new Response(
        JSON.stringify({
          success: true,
          scanned: items.length,
          new: newCount,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      await logger.error('IGDUX_SCAN_FAILED', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
      });
    }
  }
}
