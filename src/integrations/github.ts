/**
 * GitHub Data Fetching Service
 *
 * Purpose:
 * - Fetch trending and top repositories across all categories
 * - Search for new repos across all programming languages
 * - Normalize GitHub data to common Item format
 * - Cache responses in KV
 *
 * AI Agent Hints:
 * - Uses GitHub REST API (no auth for public data)
 * - Searches trending/top repos across all languages
 * - Cache for 1 hour to reduce API calls
 * - README fetched for curation content
 */

import { GitHubConfig, ItemMetadata } from '../types/domain';

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  language: string;
  owner: {
    login: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Fetch repositories based on config
 *
 * Step 1 - Determine fetch strategies (trending, top, or both)
 * Step 2 - Fetch from GitHub API across all categories
 * Step 3 - Normalize to common format
 * Step 4 - Cache results
 */
export async function fetchGitHubRepos(
  config: GitHubConfig,
  cache: KVNamespace,
  token?: string
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const strategies = config.strategies || ['trending', 'top'];
  const languages = config.languages || []; // Empty = all languages
  const since = config.since || 'daily';
  const cacheKey = `github:${JSON.stringify({ strategies, languages, since })}`;

  // Check cache
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  const allRepos: GitHubRepo[] = [];
  const seenRepos = new Set<string>(); // Deduplicate by full_name

  // Fetch from each strategy
  for (const strategy of strategies) {
    if (languages.length === 0) {
      // Fetch all languages (no filter)
      const repos = await fetchByStrategy(strategy, undefined, since, token);
      for (const repo of repos) {
        if (!seenRepos.has(repo.full_name)) {
          allRepos.push(repo);
          seenRepos.add(repo.full_name);
        }
      }
    } else {
      // Fetch for each specified language
      for (const language of languages) {
        const repos = await fetchByStrategy(strategy, language, since, token);
        for (const repo of repos) {
          if (!seenRepos.has(repo.full_name)) {
            allRepos.push(repo);
            seenRepos.add(repo.full_name);
          }
        }
      }
    }
  }

  // Sort by stars (descending) and limit
  allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count);
  const topRepos = allRepos.slice(0, 100); // Get top 100 across all strategies

  // Normalize
  const results = [];
  for (const repo of topRepos) {
    const readme = await fetchReadme(repo.full_name, token);
    results.push({
      title: repo.full_name,
      url: repo.html_url,
      content: readme || repo.description || '',
      metadata: {
        stars: repo.stargazers_count,
        language: repo.language,
        author: repo.owner.login,
        description: repo.description,
        publishedAt: repo.created_at,
      },
    });
  }

  // Cache for 1 hour
  await cache.put(cacheKey, JSON.stringify(results), { expirationTtl: 3600 });

  return results;
}

/**
 * Fetch repositories by strategy (trending or top)
 */
async function fetchByStrategy(
  strategy: 'trending' | 'top',
  language?: string,
  since: string = 'daily',
  token?: string
): Promise<GitHubRepo[]> {
  const langQuery = language ? `language:${language}` : '';
  const dateFilter = getDateFilter(since);
  
  let query = '';
  let sort = 'stars';
  let order = 'desc';

  if (strategy === 'trending') {
    // Trending: recently created repos with high star count
    query = `stars:>100 ${langQuery} ${dateFilter}`.trim();
    sort = 'stars';
    order = 'desc';
  } else if (strategy === 'top') {
    // Top: highest starred repos overall
    query = `stars:>1000 ${langQuery}`.trim();
    sort = 'stars';
    order = 'desc';
  }

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=${order}&per_page=100`;

  const response = await fetch(url, {
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json<{ items: GitHubRepo[] }>();
  return data.items || [];
}

/**
 * Fetch README content
 */
async function fetchReadme(fullName: string, token?: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${fullName}/readme`;
  const headers = buildHeaders(token, 'application/vnd.github.v3.raw');
  const response = await fetch(url, { headers });

  if (!response.ok) {
    return null;
  }

  const text = await response.text();
  return text.slice(0, 5000); // truncate for AI processing
}

/**
 * Get date filter for trending
 */
function getDateFilter(since: string): string {
  const now = new Date();
  const daysAgo: Record<string, number> = {
    daily: 1,
    weekly: 7,
    monthly: 30,
  };

  const days = daysAgo[since] || 1;
  const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return `created:>${date.toISOString().split('T')[0]}`;
}

function buildHeaders(token?: string, accept = 'application/vnd.github.v3+json'): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'Cloudflare-Curation-Hub',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}
