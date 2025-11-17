/**
 * Discord Data Fetching Service
 *
 * Purpose:
 * - Fetch messages from all channels the authenticated user follows
 * - Normalize to common format
 *
 * AI Agent Hints:
 * - Requires Discord bot token with appropriate permissions
 * - Fetches from all channels across all guilds the bot can access
 * - Cache for 15 minutes
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
 * Fetch Discord messages from all channels
 *
 * Step 1 - Check cache
 * Step 2 - Get all guilds the bot can access
 * Step 3 - Get all channels from each guild
 * Step 4 - Fetch messages from all channels
 * Step 5 - Normalize and deduplicate results
 * Step 6 - Cache results
 */
export async function fetchDiscordMessages(
  config: DiscordConfig,
  cache: KVNamespace,
  botToken?: string
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const useAuthenticatedChannels = config.useAuthenticatedChannels !== false; // Default: true
  const cacheKey = `discord:${JSON.stringify({ useAuthenticatedChannels })}`;

  // Check cache
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  if (!useAuthenticatedChannels || !botToken) {
    if (config.webhookUrl) {
      // Fallback to webhook if provided
      console.warn('[DISCORD] Using webhook fallback - limited functionality');
      return [];
    }
    throw new Error('Discord connector requires bot token. Please provide DISCORD_BOT_TOKEN.');
  }

  const headers = {
    Authorization: `Bot ${botToken}`,
    'User-Agent': 'Cloudflare-Curation-Hub/1.0',
  };

  // Step 1: Get all guilds the bot is in
  const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', { headers });
  if (!guildsResponse.ok) {
    throw new Error(`Discord API error fetching guilds: ${guildsResponse.status}`);
  }
  const guilds = await guildsResponse.json<Array<{ id: string; name: string }>>();

  const allMessages: Array<{ message: DiscordMessage; guildId: string; channelId: string; channelName: string }> = [];
  const seenMessages = new Set<string>(); // Deduplicate by message ID

  // Step 2: For each guild, get all channels
  for (const guild of guilds) {
    try {
      const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, { headers });
      if (!channelsResponse.ok) continue;

      const channels = await channelsResponse.json<Array<{ id: string; name: string; type: number }>>();
      
      // Filter to text channels (type 0)
      const textChannels = channels.filter(ch => ch.type === 0);

      // Step 3: Fetch messages from each channel
      for (const channel of textChannels) {
        try {
          const messagesResponse = await fetch(
            `https://discord.com/api/v10/channels/${channel.id}/messages?limit=50`,
            { headers }
          );
          
          if (messagesResponse.ok) {
            const messages = await messagesResponse.json<DiscordMessage[]>();
            for (const message of messages) {
              if (!seenMessages.has(message.id) && message.content.length > 50) {
                allMessages.push({
                  message,
                  guildId: guild.id,
                  channelId: channel.id,
                  channelName: channel.name,
                });
                seenMessages.add(message.id);
              }
            }
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to fetch messages from channel ${channel.name}:`, error);
          // Continue with other channels
        }
      }
    } catch (error) {
      console.error(`Failed to fetch channels from guild ${guild.name}:`, error);
      // Continue with other guilds
    }
  }

  // Step 4: Normalize results
  const results = allMessages.map(({ message, guildId, channelId, channelName }) => {
    const reactions: Record<string, number> = {};
    message.reactions?.forEach((r) => {
      reactions[r.emoji.name] = r.count;
    });

    return {
      title: `${message.author.username}: ${message.content.slice(0, 50)}...`,
      url: `https://discord.com/channels/${guildId}/${channelId}/${message.id}`,
      content: message.content,
      metadata: {
        author: `${message.author.username}#${message.author.discriminator}`,
        publishedAt: message.timestamp,
        reactions,
        channelName: channelName,
      },
    };
  });

  // Cache for 15 minutes
  await cache.put(cacheKey, JSON.stringify(results), { expirationTtl: 900 });

  return results;
}
