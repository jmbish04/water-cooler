/**
 * Reddit Data Fetching Service
 *
 * Purpose:
 * - Fetch posts from a user's authenticated feed OR a specific subreddit.
 * - Support sorting (hot, new, top, rising).
 * - Cache results to reduce API calls.
 * - Filter posts by inclusion/exclusion keywords.
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
 * Checks if a post matches the inclusion/exclusion criteria.
 */
function passesFilter(post: RedditPost, config: RedditConfig): boolean {
  const titleAndText = (post.data.title + ' ' + post.data.selftext).toLowerCase();
  
  const include = config.includeTerms?.map(t => t.toLowerCase()) || [];
  const exclude = config.excludeTerms?.map(t => t.toLowerCase()) || [];

  if (exclude.length > 0) {
    if (exclude.some(term => titleAndText.includes(term))) {
      return false; // Exclude
    }
  }
  
  if (include.length > 0) {
    if (!include.some(term => titleAndText.includes(term))) {
      return false; // Does not include required term
    }
  }
  
  return true;
}

/**
 * Fetch Reddit posts
 * (UPDATED to handle auth and filtering)
 */
export async function fetchRedditPosts(
  config: RedditConfig,
  cache: KVNamespace,
  auth?: RedditAuth // Updated from simple token
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const cacheKey = `reddit:${JSON.stringify(config)}`;

  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  let baseUrl = 'https://www.reddit.com';
  let path = '';
  const headers: HeadersInit = {
    'User-Agent': 'Cloudflare-Curation-Hub/1.0',
  };

  const isFeed = config.subreddit === 'MY_FEED';

  if (isFeed && auth) {
    // --- NEW AUTH LOGIC ---
    try {
      const accessToken = await getAccessToken(auth);
      baseUrl = 'https://oauth.reddit.com';
      path = `/${config.sort || 'top'}.json`;
      headers['Authorization'] = `Bearer ${accessToken}`;
    } catch (err) {
      console.error("Reddit auth failed, falling back to public.", err);
      // Fallback to unauthenticated public feed on auth error
      path = `/r/all/${config.sort || 'top'}.json`;
    }
    // --- END NEW AUTH LOGIC ---
  } else {
    // Unauthenticated request
    path = `/r/${config.subreddit}/${config.sort || 'top'}.json`;
  }

  const params = new URLSearchParams({
    limit: '100',
  });

  if ((config.sort === 'top' || config.sort === 'rising') && config.timeframe) {
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
    .filter(post => passesFilter(post, config)) // Filter by keywords
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
