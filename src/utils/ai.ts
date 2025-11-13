/**
 * AI Payload Adapter (Router)
 *
 * Creates the correct payload for ai.run() based on the model ID.
 * - gpt-oss-120b expects: { input: string | array, reasoning?: { effort, summary } }
 * - Llama/Mistral expect: { messages: [...] }
 * - Fallback: { prompt: "..." }
 */
export function createAiPayload(
  model: string,
  instructions: string,
  prompt: string
): Record<string, unknown> {
  // Route for gpt-oss-120b
  // According to Cloudflare docs, input field should contain both instructions and prompt
  if (model.includes('gpt-oss-120b')) {
    return {
      input: `${instructions}\n\n${prompt}`,
      reasoning: {
        effort: 'medium'
      }
    };
  }

  // Route for Llama 3, Mistral, etc. (using messages format)
  if (model.includes('llama') || model.includes('mistral')) {
    return {
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: prompt },
      ],
    };
  }

  // Fallback for other/older text-generation models
  return {
    prompt: `${instructions}\n\n${prompt}`,
  };
}

/**
 * Splits text into chunks
 * A simple word-based chunker. For production, you might use a token-based chunker.
 */
export function chunkText(text: string, maxWordsPerChunk: number = 400): string[] {
  const words = text.split(/\s+/); // Split by whitespace
  const chunks: string[] = [];

  if (words.length === 0) {
    return [];
  }

  for (let i = 0; i < words.length; i += maxWordsPerChunk) {
    const chunk = words.slice(i, i + maxWordsPerChunk).join(' ');
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * Averages an array of embedding vectors
 */
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (!embeddings || embeddings.length === 0) {
    return [];
  }

  const vecLength = embeddings[0].length;
  const avgVector: number[] = new Array(vecLength).fill(0);

  // Sum all vectors
  for (const vec of embeddings) {
    if (vec.length !== vecLength) continue; // Sanity check
    for (let i = 0; i < vecLength; i++) {
      avgVector[i] += vec[i];
    }
  }

  // Divide by the number of vectors to get the average
  for (let i = 0; i < vecLength; i++) {
    avgVector[i] = avgVector[i] / embeddings.length;
  }

  return avgVector;
}
