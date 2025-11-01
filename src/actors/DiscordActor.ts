/**
 * Discord Actor (Durable Object)
 *
 * Purpose:
 * - Fetch messages from Discord channels
 * - Enqueue items for curation
 * - Track processed messages
 */

import { Env } from '../types/env';
import { DiscordConfig } from '../types/domain';
import { fetchDiscordMessages } from '../services/discord';
import { createLogger } from '../utils/logger';
import { generateItemId } from '../utils/hash';

export class DiscordActor implements DurableObject {
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
    const logger = createLogger(this.env.DB, 'DiscordActor');
    const start = Date.now();

    try {
      const { sourceId, config } = await request.json<{
        sourceId: number;
        config: DiscordConfig;
      }>();

      const messages = await fetchDiscordMessages(
        config,
        this.env.CACHE,
        this.env.DISCORD_BOT_TOKEN
      );
      const processed = (await this.state.storage.get<Set<string>>('processed')) || new Set();

      let newCount = 0;
      for (const msg of messages) {
        if (!processed.has(msg.url)) {
          const itemId = await generateItemId(sourceId, msg.url);
          const curatorId = this.env.CURATOR_ACTOR.idFromName(itemId);
          const curatorStub = this.env.CURATOR_ACTOR.get(curatorId);

          await curatorStub.fetch('http://curator/curate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemId,
              sourceId,
              source: 'discord',
              title: msg.title,
              url: msg.url,
              content: msg.content,
              metadata: msg.metadata,
            }),
          });

          processed.add(msg.url);
          newCount++;
        }
      }

      await this.state.storage.put('processed', processed);

      await logger.info('DISCORD_SCAN_COMPLETED', {
        sourceId,
        totalMessages: messages.length,
        newMessages: newCount,
        durationMs: Date.now() - start,
      });

      return new Response(
        JSON.stringify({ success: true, scanned: messages.length, new: newCount }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      await logger.error('DISCORD_SCAN_FAILED', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }
}
