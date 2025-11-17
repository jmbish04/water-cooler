/**
 * API Client
 *
 * Purpose:
 * - Fetch functions for all API endpoints
 * - Type-safe responses
 * - Error handling
 */

export interface Item {
  id: string;
  sourceId: number;
  title: string;
  url: string;
  summary: string | null;
  tags: string[] | null;
  reason: string | null;
  score: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  items: Item[];
  total: number;
  offset: number;
  limit: number;
}

export interface QAResponse {
  answer: string;
  citations: string[];
  relatedItems?: Item[];
  model: string;
}

const API_BASE = '/api';

/**
 * Fetch items with filters
 */
export async function fetchItems(params: {
  source?: string;
  unread?: boolean;
  starred?: boolean;
  minScore?: number;
  limit?: number;
  offset?: number;
}): Promise<SearchResult> {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      query.append(key, String(value));
    }
  });

  const response = await fetch(`${API_BASE}/items?${query.toString()}`, {
    headers: {
      'X-User-ID': getUserId(),
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch items');
  }

  return response.json();
}

/**
 * Search items
 */
export async function searchItems(q: string, filters?: {
  source?: string;
  tags?: string[];
  minScore?: number;
}): Promise<SearchResult> {
  const query = new URLSearchParams({ q });

  if (filters?.source) query.append('source', filters.source);
  if (filters?.minScore !== undefined) query.append('minScore', String(filters.minScore));
  if (filters?.tags) query.append('tags', filters.tags.join(','));

  const response = await fetch(`${API_BASE}/search?${query.toString()}`, {
    headers: {
      'X-User-ID': getUserId(),
    },
  });

  if (!response.ok) {
    throw new Error('Failed to search items');
  }

  return response.json();
}

/**
 * Ask AI about an item
 */
export async function askQuestion(itemId: string, question: string, includeRelated = false): Promise<QAResponse> {
  const response = await fetch(`${API_BASE}/items/${itemId}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': getUserId(),
    },
    body: JSON.stringify({ question, includeRelated }),
  });

  if (!response.ok) {
    throw new Error('Failed to ask question');
  }

  return response.json();
}

/**
 * Star/unstar item
 */
export async function toggleStar(itemId: string, starred: boolean): Promise<void> {
  const response = await fetch(`${API_BASE}/star/${itemId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': getUserId(),
    },
    body: JSON.stringify({ starred }),
  });

  if (!response.ok) {
    throw new Error('Failed to toggle star');
  }
}

/**
 * Add/remove from follow-up
 */
export async function toggleFollowup(itemId: string, followup: boolean): Promise<void> {
  const response = await fetch(`${API_BASE}/followup/${itemId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': getUserId(),
    },
    body: JSON.stringify({ followup }),
  });

  if (!response.ok) {
    throw new Error('Failed to toggle followup');
  }
}

/**
 * Mark as read
 */
export async function markRead(itemId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/mark-read/${itemId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': getUserId(),
    },
    body: JSON.stringify({ read: true }),
  });

  if (!response.ok) {
    throw new Error('Failed to mark as read');
  }
}

/**
 * Trigger manual scan
 */
export async function triggerScan(): Promise<void> {
  const response = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error('Failed to trigger scan');
  }
}

/**
 * Get user ID (for demo, generate/retrieve from localStorage)
 */
function getUserId(): string {
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = `user-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('userId', userId);
  }
  return userId;
}
