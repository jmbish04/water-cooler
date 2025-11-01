/**
 * Discord Data Fetching Service
 *
 * Purpose:
 * - Fetch messages from Discord channels (via webhook or bot)
 * - Normalize to common format
 *
 * AI Agent Hints:
 * - Requires Discord webhook URL or bot token
 * - Use webhookUrl from config for fetching
 * - Alternative: use Discord bot with message history permission
 * - Cache for 15 minutes
 *
 * Note: This is a simplified implementation. Production would need:
 * - Discord bot authentication
 * - Proper message history fetching
 * - Rate limiting
 */

import { DiscordConfig, ItemMetadata } from '../types/domain';

interface DiscordMessage {
  id: string;
  content: string;
  author: {
    username: string;
    discriminator: string;
  };
  timestamp: string;
  reactions?: Array<{
    emoji: { name: string };
    count: number;
  }>;
}

/**
 * Fetch Discord messages
 *
 * Step 1 - Check cache
 * Step 2 - Fetch messages (requires bot token or webhook)
 * Step 3 - Normalize results
 * Step 4 - Cache results
 *
 * NOTE: This is a placeholder. Real implementation requires Discord bot setup.
 */
export async function fetchDiscordMessages(
  config: DiscordConfig,
  cache: KVNamespace,
  botToken?: string
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const cacheKey = `discord:${config.guildId}:${config.channelId}`;

  // Check cache
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  // Fetch messages (requires Discord bot token)
  if (!botToken) {
    console.warn('[DISCORD] No bot token configured, returning empty results');
    return [];
  }

  const url = `https://discord.com/api/v10/channels/${config.channelId}/messages?limit=50`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${botToken}`,
      'User-Agent': 'Cloudflare-Curation-Hub/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Discord API error: ${response.status}`);
  }

  const messages = await response.json<DiscordMessage[]>();

  // Normalize (only messages with substantial content)
  const results = messages
    .filter((msg) => msg.content.length > 50)
    .map((msg) => {
      const reactions: Record<string, number> = {};
      msg.reactions?.forEach((r) => {
        reactions[r.emoji.name] = r.count;
      });

      return {
        title: `${msg.author.username}: ${msg.content.slice(0, 50)}...`,
        url: `https://discord.com/channels/${config.guildId}/${config.channelId}/${msg.id}`,
        content: msg.content,
        metadata: {
          author: `${msg.author.username}#${msg.author.discriminator}`,
          publishedAt: msg.timestamp,
          reactions,
          channelName: config.channelId,
        },
      };
    });

  // Cache for 15 minutes
  await cache.put(cacheKey, JSON.stringify(results), { expirationTtl: 900 });

  return results;
}
