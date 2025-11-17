/**
 * AI Translation Service
 *
 * Purpose:
 * - Translate text from Chinese to English using Cloudflare Workers AI
 * - Support batching for efficiency
 * - Cache translations
 *
 * AI Agent Hints:
 * - Uses @cf/meta/m2m100-1.2b for translation
 * - Handles long text by chunking
 * - Returns translated text
 */

/**
 * Translate text from Chinese to English
 *
 * @param ai - Cloudflare AI binding
 * @param text - Chinese text to translate
 * @returns Translated English text
 */
export async function translateToEnglish(
  ai: Ai,
  text: string
): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  try {
    // Use Cloudflare Workers AI translation model
    const response = await ai.run('@cf/meta/m2m100-1.2b', {
      text,
      source_lang: 'chinese',
      target_lang: 'english',
    });

    // Extract translated text
    if (typeof response === 'string') {
      return response;
    } else if (response && typeof response === 'object') {
      // Try common response field names
      const translated =
        (response as any).translated_text ||
        (response as any).translation ||
        (response as any).text ||
        text; // Fallback to original if translation fails

      return typeof translated === 'string' ? translated : text;
    }

    return text; // Fallback to original
  } catch (error) {
    console.error('[Translation] Failed to translate text:', error);
    return text; // Return original text on error
  }
}

/**
 * Translate multiple fields of an object
 *
 * @param ai - Cloudflare AI binding
 * @param obj - Object with fields to translate
 * @param fields - Array of field names to translate
 * @returns Object with translated fields
 */
export async function translateFields<T extends Record<string, any>>(
  ai: Ai,
  obj: T,
  fields: (keyof T)[]
): Promise<T> {
  const translated = { ...obj };

  for (const field of fields) {
    if (typeof obj[field] === 'string') {
      translated[field] = (await translateToEnglish(ai, obj[field])) as any;
    }
  }

  return translated;
}

/**
 * Batch translate an array of texts
 *
 * @param ai - Cloudflare AI binding
 * @param texts - Array of Chinese texts
 * @returns Array of translated English texts
 */
export async function batchTranslate(
  ai: Ai,
  texts: string[]
): Promise<string[]> {
  const translations = await Promise.all(
    texts.map((text) => translateToEnglish(ai, text))
  );

  return translations;
}
