/**
 * Hashing Utilities
 *
 * Purpose:
 * - Generate deterministic item IDs from source+url
 * - Create content hashes for deduplication
 *
 * AI Agent Hints:
 * - Item IDs must be deterministic for deduplication
 * - Use SHA-256 for collision resistance
 * - Web Crypto API available in Cloudflare Workers
 */

/**
 * Generate deterministic item ID from source and URL
 *
 * Step 1 - Create canonical string: "sourceId:url"
 * Step 2 - Hash with SHA-256
 * Step 3 - Return hex string
 */
export async function generateItemId(sourceId: number, url: string): Promise<string> {
  // Step 1 - Create canonical input
  const input = `${sourceId}:${url}`;

  // Step 2 - Hash with SHA-256
  return sha256(input);
}

/**
 * SHA-256 hash (hex output)
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash email content for deduplication
 */
export async function hashEmailContent(html: string): Promise<string> {
  return sha256(html);
}
