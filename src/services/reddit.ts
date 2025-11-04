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

/**
 * Checks if a post matches the inclusion/exclusion criteria.
 */
function passesFilter(post: RedditPost, config: RedditConfig): boolean {
  const titleAndText = (post.data.title + ' ' + post.data.selftext).toLowerCase();
  
  const include = config.includeTerms?.map(t => t.toLowerCase()) || [];
  const exclude = config.excludeTerms?.map(t => t.toLowerCase()) || [];

  // 1. Check for exclusions
  if (exclude.length > 0) {
    if (exclude.some(term => titleAndText.includes(term))) {
      return false; // Exclude this post
    }
  }
  
  // 2. Check for inclusions (if any are specified)
  if (include.length > 0) {
    if (!include.some(term => titleAndText.includes(term))) {
      return false; // Does not include a required term
    }
  }
  
  return true; // Pass
}

/**
 * Fetch Reddit posts
 *
 * Step 1 - Build Reddit API URL (authenticated or unauthenticated)
 * Step 2 - Check cache
 * Step 3 - Fetch from Reddit
 * Step 4 - Filter results by keywords
 * Step 5 - Normalize results
 * Step 6 - Cache results
 */
export async function fetchRedditPosts(
  config: RedditConfig, // We will update this type in `src/types/domain.ts`
  cache: KVNamespace,
  token?: string // The OAuth token from env
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const cacheKey = `reddit:${JSON.stringify(config)}`;

  // Step 2 - Check cache
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  // Step 1 - Build URL
  let baseUrl = 'https://www.reddit.com';
  let path = '';

  // Check if this is an authenticated feed request
  const isFeed = config.subreddit === 'MY_FEED'; 

  if (isFeed && token) {
    // Authenticated request for the user's feed
    baseUrl = 'https://oauth.reddit.com';
    path = `/${config.sort || 'top'}.json`;
  } else {
    // Unauthenticated request for a specific public subreddit
    const subreddit = isFeed ? 'all' : config.subreddit; // Fallback to 'all' if token is missing
    path = `/r/${subreddit}/${config.sort || 'top'}.json`;
  }

  const params = new URLSearchParams({
    limit: '100', // Fetch more to allow for filtering
  });

  if ((config.sort === 'top' || config.sort === 'rising') && config.timeframe) {
    params.set('t', config.timeframe);
  }

  const fullUrl = `${baseUrl}${path}?${params.toString()}`;

  // Step 3 - Fetch from Reddit
  const headers: HeadersInit = {
    'User-Agent': 'Cloudflare-Curation-Hub/1.0',
  };

  if (isFeed && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, { headers });

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status} at ${fullUrl}`);
  }

  const data = await response.json<{ data: { children: RedditPost[] } }>();
  const posts = data.data?.children || [];

  // Step 4 & 5 - Filter and Normalize results
  const results = posts
    .filter(post => passesFilter(post, config)) // Filter by keywords
    .filter(post => !post.data.selftext?.includes('[removed]')) // Filter removed
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
        blob: JSON.stringify(data)
      },
    }));

  // Step 6 - Cache for 30 minutes
  await cache.put(cacheKey, JSON.stringify(results), { expirationTtl: 1800 });

  return results;
}
