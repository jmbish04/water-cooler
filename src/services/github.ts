/**
 * GitHub Data Fetching Service
 *
 * Purpose:
 * - Fetch trending repositories
 * - Fetch specific org/repo data
 * - Normalize GitHub data to common Item format
 * - Cache responses in KV
 *
 * AI Agent Hints:
 * - Uses GitHub REST API (no auth for public data)
 * - Trending via unofficial API (github-trending-api or scraping)
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
 * Step 1 - Determine fetch strategy (trending vs org repos)
 * Step 2 - Fetch from GitHub API
 * Step 3 - Normalize to common format
 * Step 4 - Cache results
 */
export async function fetchGitHubRepos(
  config: GitHubConfig,
  cache: KVNamespace,
  token?: string
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const cacheKey = `github:${JSON.stringify(config)}`;

  // Check cache
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  let repos: GitHubRepo[] = [];

  // Strategy 1: Trending
  if (config.trending) {
    repos = await fetchTrending(config.trending.language, config.trending.since, token);
  }
  // Strategy 2: Org repos
  else if (config.org) {
    repos = await fetchOrgRepos(config.org, config.repos, token);
  }

  // Normalize
  const results = [];
  for (const repo of repos.slice(0, 20)) {
    // limit to 20
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
 * Fetch trending repositories
 */
async function fetchTrending(
  language?: string,
  since: string = 'daily',
  token?: string
): Promise<GitHubRepo[]> {
  // Use GitHub search API as a proxy for trending
  const langQuery = language ? `language:${language}` : '';
  const dateFilter = getDateFilter(since);
  const query = `stars:>100 ${langQuery} ${dateFilter}`.trim();

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`;

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
 * Fetch organization repositories
 */
async function fetchOrgRepos(
  org: string,
  repos?: string[],
  token?: string
): Promise<GitHubRepo[]> {
  if (repos && repos.length > 0) {
    // Fetch specific repos
    const results = [];
    for (const repo of repos) {
      const url = `https://api.github.com/repos/${org}/${repo}`;
      const response = await fetch(url, {
        headers: buildHeaders(token),
      });

      if (response.ok) {
        const data = await response.json<GitHubRepo>();
        results.push(data);
      }
    }
    return results;
  } else {
    // Fetch all org repos
    const url = `https://api.github.com/orgs/${org}/repos?sort=updated&per_page=30`;
    const response = await fetch(url, {
      headers: buildHeaders(token),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return await response.json<GitHubRepo[]>();
  }
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
