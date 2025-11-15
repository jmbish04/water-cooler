/**
 * App Store Actor (Durable Object)
 *
 * Purpose:
 * - Fetch apps from iTunes Search API
 * - Enqueue items for curation
 * - Track processed apps
 */

import { Env } from '../types/env';
import { AppStoreConfig } from '../types/domain';
import { fetchAppStoreApps } from '../services/appstore';
import { createLogger } from '../utils/logger';
import { generateItemId } from '../utils/hash';

export class AppStoreActor implements DurableObject {
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
    const logger = createLogger(this.env.DB, 'AppStoreActor');
    const start = Date.now();

    try {
      const { sourceId, config, force, startDate, endDate } = await request.json<{
        sourceId: number;
        config: AppStoreConfig;
        force?: boolean;
        startDate?: string;
        endDate?: string;
      }>();

      const apps = await fetchAppStoreApps(config, this.env.CACHE);
      const processed = (await this.state.storage.get<Set<string>>('processed')) || new Set();

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
      for (const app of apps) {
        if (!inRange(app.metadata?.publishedAt)) {
          continue;
        }

        if (force || !processed.has(app.url)) {
          const itemId = await generateItemId(sourceId, app.url);
          const curatorId = this.env.CURATOR_ACTOR.idFromName(itemId);
          const curatorStub = this.env.CURATOR_ACTOR.get(curatorId);

          await curatorStub.fetch('http://curator/curate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemId,
              sourceId,
              source: 'appstore',
              title: app.title,
              url: app.url,
              content: app.content,
              metadata: app.metadata,
            }),
          });

          processed.add(app.url);
          newCount++;
        }
      }

      await this.state.storage.put('processed', processed);

      await logger.info('APPSTORE_SCAN_COMPLETED', {
        sourceId,
        totalApps: apps.length,
        newApps: newCount,
        durationMs: Date.now() - start,
      });

      return new Response(
        JSON.stringify({ success: true, scanned: apps.length, new: newCount }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      await logger.error('APPSTORE_SCAN_FAILED', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }
}
