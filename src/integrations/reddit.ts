/**
 * Reddit Data Fetching Service
 *
 * Purpose:
 * - Fetch posts from authenticated user's feed (all communities they follow).
 * - Support sorting (hot, new, top, rising).
 * - Cache results to reduce API calls.
 *
 * AI Agent Hints:
 * - Uses Reddit OAuth API (requires auth token for user feeds).
 * - Cache for 30 minutes (Reddit moves fast).
 * - Use selftext + title for curation.
 */

import { RedditConfig, ItemMetadata } from '../types/domain';

// This is the raw post structure from the Reddit API
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

interface RedditAuth {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Exchanges a refresh token for a short-lived access token.
 */
async function getAccessToken(auth: RedditAuth): Promise<string> {
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${auth.clientId}:${auth.clientSecret}`),
      "User-Agent": "Cloudflare-Curation-Hub/1.0",
    },
    body: `grant_type=refresh_token&refresh_token=${auth.refreshToken}`,
  });

  if (!response.ok) {
    throw new Error(`Reddit token refresh failed: ${response.status}`);
  }

  const data = await response.json<{ access_token: string }>();
  return data.access_token;
}


/**
 * Fetch Reddit posts from authenticated user's feed
 * Processes all new posts from communities the user follows
 */
export async function fetchRedditPosts(
  config: RedditConfig,
  cache: KVNamespace,
  auth?: RedditAuth
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const useAuthenticatedFeed = config.useAuthenticatedFeed !== false; // Default: true
  const cacheKey = `reddit:${JSON.stringify(config)}`;

  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  if (!useAuthenticatedFeed || !auth) {
    throw new Error('Reddit connector requires authenticated feed. Please provide Reddit OAuth credentials.');
  }

  // Get access token
  let accessToken: string;
  try {
    accessToken = await getAccessToken(auth);
  } catch (err) {
    throw new Error(`Reddit authentication failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fetch from authenticated user's feed (all communities they follow)
  const baseUrl = 'https://oauth.reddit.com';
  const sort = config.sort || 'new'; // Default to 'new' for new posts
  const path = `/${sort}.json`;
  const headers: HeadersInit = {
    'User-Agent': 'Cloudflare-Curation-Hub/1.0',
    'Authorization': `Bearer ${accessToken}`,
  };

  const params = new URLSearchParams({
    limit: '100',
  });

  if ((sort === 'top' || sort === 'rising') && config.timeframe) {
    params.set('t', config.timeframe);
  }

  const fullUrl = `${baseUrl}${path}?${params.toString()}`;
  const response = await fetch(fullUrl, { headers });

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status} at ${fullUrl}`);
  }

  const data = await response.json<{ data: { children: RedditPost[] } }>();
  const posts = data.data?.children || [];

  const results = posts
    .filter(post => !post.data.selftext?.includes('[removed]'))
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

  await cache.put(cacheKey, JSON.stringify(results), { expirationTtl: 1800 });

  return results;
}
