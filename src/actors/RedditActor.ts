/**
 * Reddit Actor (Durable Object)
 *
 * Purpose:
 * - Fetch posts from subreddits
 * - Enqueue items for curation
 * - Track processed posts
 */

import { Env } from '../types/env';
import { RedditConfig } from '../types/domain';
import { fetchRedditPosts } from '../services/reddit';
import { createLogger } from '../utils/logger';
import { generateItemId } from '../utils/hash';

export class RedditActor implements DurableObject {
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
    const logger = createLogger(this.env.DB, 'RedditActor');
    const start = Date.now();

    try {
      const { sourceId, config } = await request.json<{
        sourceId: number;
        config: RedditConfig;
      }>();

      const posts = await fetchRedditPosts(
        config, 
        this.env.CACHE, 
        this.env.REDDIT_OAUTH_TOKEN
      );
      const processed = (await this.state.storage.get<Set<string>>('processed')) || new Set();

      let newCount = 0;
      for (const post of posts) {
        if (!processed.has(post.url)) {
          const itemId = await generateItemId(sourceId, post.url);
          const curatorId = this.env.CURATOR_ACTOR.idFromName(itemId);
          const curatorStub = this.env.CURATOR_ACTOR.get(curatorId);

          await curatorStub.fetch('http://curator/curate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemId,
              sourceId,
              source: 'reddit',
              title: post.title,
              url: post.url,
              content: post.content,
              metadata: post.metadata,
            }),
          });

          processed.add(post.url);
          newCount++;
        }
      }

      await this.state.storage.put('processed', processed);

      await logger.info('REDDIT_SCAN_COMPLETED', {
        sourceId,
        totalPosts: posts.length,
        newPosts: newCount,
        durationMs: Date.now() - start,
      });

      return new Response(
        JSON.stringify({ success: true, scanned: posts.length, new: newCount }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      await logger.error('REDDIT_SCAN_FAILED', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }
}
