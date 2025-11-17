/**
 * App Store Data Fetching Service
 *
 * Purpose:
 * - Fetch apps from iTunes Search API across all categories
 * - Process all available apps that haven't been processed
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
 * Step 1 - Check if processing all categories
 * Step 2 - Fetch from all categories or single category
 * Step 3 - Normalize and deduplicate results
 * Step 4 - Cache results
 */
export async function fetchAppStoreApps(
  config: AppStoreConfig,
  cache: KVNamespace
): Promise<Array<{ title: string; url: string; content: string; metadata: ItemMetadata }>> {
  const processAll = config.processAll !== false; // Default: true
  const country = config.country || 'US';
  const cacheKey = `appstore:${JSON.stringify({ processAll, country })}`;

  // Check cache
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as any;
  }

  const allApps: iTunesApp[] = [];
  const seenApps = new Set<number>(); // Deduplicate by trackId

  if (processAll) {
    // Process all categories
    const categories = getAllCategories();
    for (const [categoryName, genreId] of Object.entries(categories)) {
      try {
        const apps = await fetchAppsByCategory(genreId, country);
        for (const app of apps) {
          if (!seenApps.has(app.trackId)) {
            allApps.push(app);
            seenApps.add(app.trackId);
          }
        }
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to fetch apps for category ${categoryName}:`, error);
        // Continue with other categories
      }
    }
  } else {
    // Fallback: fetch without category filter (general search)
    const apps = await fetchAppsByCategory(undefined, country);
    allApps.push(...apps);
  }

  // Normalize
  const results = allApps.map((app) => ({
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
 * Fetch apps for a specific category
 */
async function fetchAppsByCategory(
  genreId: string | undefined,
  country: string
): Promise<iTunesApp[]> {
  const params = new URLSearchParams({
    entity: 'software',
    country: country,
    limit: '200', // Max per category
  });

  if (genreId) {
    params.set('genreId', genreId);
  }

  const url = `https://itunes.apple.com/search?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`iTunes API error: ${response.status}`);
  }

  const data = await response.json<{ results: iTunesApp[] }>();
  return data.results || [];
}

/**
 * Get all App Store categories
 */
function getAllCategories(): Record<string, string> {
  return {
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
    games: '6014',
    music: '6011',
    photo: '6008',
    reference: '6006',
    shopping: '6024',
    sports: '6004',
    travel: '6003',
    weather: '6001',
  };
}

