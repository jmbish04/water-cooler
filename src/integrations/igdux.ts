/**
 * Igdux JSON Feed Fetching Service
 *
 * Purpose:
 * - Fetch posts from Igdux JSON feed (https://www.igdux.com/feed?format=json)
 * - Parse JSON feed format
 * - Translate Chinese content to English using Workers AI
 * - Cache results
 *
 * AI Agent Hints:
 * - Igdux is a collection of excellent Cloudflare Worker projects
 * - Content is in Chinese and needs translation
 * - Cache for 1 hour (content updates regularly)
 */

import { ItemMetadata } from '../types/domain';
import { translateToEnglish } from '../services/translation';

/**
 * Igdux JSON feed item structure
 */
interface IgduxFeedItem {
  id: string;
  url: string;
  title: string;
  content_html?: string;
  content_text?: string;
  summary?: string;
  date_published?: string;
  date_modified?: string;
  author?: {
    name?: string;
    url?: string;
  };
  tags?: string[];
  image?: string;
}

/**
 * Igdux JSON feed structure
 */
interface IgduxFeed {
  version: string;
  title: string;
  home_page_url?: string;
  feed_url?: string;
  description?: string;
  items: IgduxFeedItem[];
}

/**
 * Fetch and parse Igdux JSON feed
 *
 * @param ai - Cloudflare AI binding for translation
 * @param cache - KV namespace for caching
 * @returns Array of parsed and translated items
 */
export async function fetchIgduxFeed(
  ai: Ai,
  cache: KVNamespace
): Promise<
  Array<{
    title: string;
    url: string;
    content: string;
    metadata: ItemMetadata;
  }>
> {
  const feedUrl = 'https://www.igdux.com/feed?format=json';
  const cacheKey = `igdux:feed`;

  // Check cache first
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as Awaited<ReturnType<typeof fetchIgduxFeed>>;
  }

  try {
    // Fetch JSON feed
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Cloudflare-Curation-Hub/1.0',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Igdux feed fetch failed: ${response.status}`);
    }

    const feed = (await response.json()) as IgduxFeed;

    if (!feed.items || !Array.isArray(feed.items)) {
      throw new Error('Invalid feed format: missing items array');
    }

    // Process and translate items
    const results = await Promise.all(
      feed.items.map(async (item) => {
        // Extract content (prefer content_text over content_html)
        const rawContent =
          item.content_text ||
          item.summary ||
          stripHtml(item.content_html || '') ||
          item.title;

        // Translate title and content from Chinese to English
        const [translatedTitle, translatedContent] = await Promise.all([
          translateToEnglish(ai, item.title),
          translateToEnglish(ai, rawContent),
        ]);

        return {
          title: translatedTitle,
          url: item.url,
          content: translatedContent,
          metadata: {
            author: item.author?.name,
            publishedAt: item.date_published,
            imageUrl: item.image,
            // Store original Chinese title for reference
            originalTitle: item.title,
            tags: item.tags,
          } as ItemMetadata,
        };
      })
    );

    // Cache for 1 hour
    await cache.put(cacheKey, JSON.stringify(results), {
      expirationTtl: 3600,
    });

    return results;
  } catch (error) {
    console.error('[Igdux] Feed fetch failed:', error);
    throw error;
  }
}

/**
 * Strip HTML tags from content
 *
 * @param html - HTML string
 * @returns Plain text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp;
    .replace(/&amp;/g, '&') // Replace &amp;
    .replace(/&lt;/g, '<') // Replace &lt;
    .replace(/&gt;/g, '>') // Replace &gt;
    .replace(/&quot;/g, '"') // Replace &quot;
    .replace(/&#39;/g, "'") // Replace &#39;
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}
