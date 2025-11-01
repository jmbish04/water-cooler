/**
 * App Store Data Fetching Service
 *
 * Purpose:
 * - Fetch apps from iTunes Search API
 * - Support search by term, category
 * - Cache results to reduce API calls
 *
 * AI Agent Hints:
 * - iTunes Search API is free, no auth required
 * - Returns JSON with app metadata
 * - Cache for 6 hours (apps change slowly)
 * - Use description for AI curation
 */

import { AppStoreConfig, ItemMetadata } from '../types/domain';

interface iTunesApp {
  trackId: number;
  trackName: string;
  trackViewUrl: string;
  description: string;
  averageUserRating: number;
  userRatingCount: number;
  price: number;
  artistName: string;
  artworkUrl512: string;
  releaseDate: string;
  primaryGenreName: string;
}

/**
 * Fetch apps from iTunes Search API
 *
 * Step 1 - Build search query
 * Step 2 - Check cache
 * Step 3 - Fetch from iTunes API
 * Step 4 - Normalize results
 * Step 5 - Cache results
 */
export async function fetchAppStoreApps(
  config: AppStoreConfig,
  cache: KVNamespace
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const cacheKey = `appstore:${JSON.stringify(config)}`;

  // Check cache
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  // Build query
  const params = new URLSearchParams({
    entity: 'software',
    country: config.country || 'US',
    limit: '30',
  });

  if (config.term) {
    params.set('term', config.term);
  }

  if (config.category) {
    params.set('genreId', getCategoryId(config.category));
  }

  // Fetch from iTunes API
  const url = `https://itunes.apple.com/search?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`iTunes API error: ${response.status}`);
  }

  const data = await response.json<{ results: iTunesApp[] }>();
  const apps = data.results || [];

  // Normalize
  const results = apps.map((app) => ({
    title: app.trackName,
    url: app.trackViewUrl,
    content: app.description,
    metadata: {
      rating: app.averageUserRating,
      ratingCount: app.userRatingCount,
      price: app.price,
      developer: app.artistName,
      imageUrl: app.artworkUrl512,
      publishedAt: app.releaseDate,
      description: app.description,
    },
  }));

  // Cache for 6 hours
  await cache.put(cacheKey, JSON.stringify(results), { expirationTtl: 21600 });

  return results;
}

/**
 * Map category name to iTunes genre ID
 */
function getCategoryId(category: string): string {
  const categories: Record<string, string> = {
    productivity: '6007',
    business: '6000',
    education: '6017',
    entertainment: '6016',
    finance: '6015',
    'health-fitness': '6013',
    lifestyle: '6012',
    news: '6009',
    social: '6005',
    utilities: '6002',
  };

  return categories[category.toLowerCase()] || '6007'; // default to productivity
}
