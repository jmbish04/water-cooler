/**
 * Reddit Data Fetching Service
 *
 * Purpose:
 * - Fetch posts from subreddits
 * - Support sorting (hot, new, top, rising)
 * - Cache results to reduce API calls
 *
 * AI Agent Hints:
 * - Uses Reddit JSON API (no auth for public subreddits)
 * - Add .json to subreddit URLs
 * - Cache for 30 minutes (Reddit moves fast)
 * - Use selftext + title for curation
 */

import { RedditConfig, ItemMetadata } from '../types/domain';

interface RedditPost {
  data: {
    title: string;
    url: string;
    permalink: string;
    selftext: string;
    author: string;
    score: number;
    num_comments: number;
    subreddit: string;
    created_utc: number;
    thumbnail: string;
  };
}

/**
 * Fetch Reddit posts
 *
 * Step 1 - Build Reddit API URL
 * Step 2 - Check cache
 * Step 3 - Fetch from Reddit
 * Step 4 - Normalize results
 * Step 5 - Cache results
 */
export async function fetchRedditPosts(
  config: RedditConfig,
  cache: KVNamespace
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const cacheKey = `reddit:${JSON.stringify(config)}`;

  // Check cache
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  // Build URL
  const sort = config.sort || 'hot';
  const url = `https://www.reddit.com/r/${config.subreddit}/${sort}.json?limit=30`;

  // Add timeframe for 'top'
  const params = new URLSearchParams();
  if (sort === 'top' && config.timeframe) {
    params.set('t', config.timeframe);
  }

  const fullUrl = params.toString() ? `${url}&${params.toString()}` : url;

  // Fetch from Reddit
  const response = await fetch(fullUrl, {
    headers: {
      'User-Agent': 'Cloudflare-Curation-Hub/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status}`);
  }

  const data = await response.json<{ data: { children: RedditPost[] } }>();
  const posts = data.data?.children || [];

  // Normalize
  const results = posts
    .filter((post) => !post.data.selftext?.includes('[removed]'))
    .map((post) => ({
      title: post.data.title,
      url: `https://reddit.com${post.data.permalink}`,
      content: post.data.selftext || post.data.title,
      metadata: {
        upvotes: post.data.score,
        comments: post.data.num_comments,
        subreddit: post.data.subreddit,
        author: post.data.author,
        publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
        imageUrl:
          post.data.thumbnail && post.data.thumbnail.startsWith('http')
            ? post.data.thumbnail
            : undefined,
      },
    }));

  // Cache for 30 minutes
  await cache.put(cacheKey, JSON.stringify(results), { expirationTtl: 1800 });

  return results;
}
