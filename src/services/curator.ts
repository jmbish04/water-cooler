/**
 * AI Curation Service
 *
 * Purpose:
 * - Analyze content with AI (summarize, tag, score)
 * - Generate embeddings for semantic search
 * - Insert vectors into Vectorize index
 * - Answer questions about items with grounded responses
 *
 * AI Agent Hints:
 * - Uses env.AI_MODEL for all LLM operations
 * - Embeddings use @cf/baai/bge-base-en-v1.5 (768 dimensions)
 * - Vectorize handles deduplication by ID
 * - Q&A uses vector search for related context
 *
 * Flow:
 * 1. Fetch item content (README, description, etc.)
 * 2. Call AI to generate summary, tags, reason, score
 * 3. Generate embedding
 * 4. Insert into Vectorize
 * 5. Return CurationResult
 */

import { CurationRequest, CurationResult, QARequest, QAResponse, Item } from '../types/domain';
import { getAIModel } from '../types/env';
import { createLogger } from '../utils/logger';
import { createAiPayload } from '../utils/ai';

/**
 * Curate content with AI
 *
 * Step 1 - Build curation prompt
 * Step 2 - Call AI model
 * Step 3 - Parse structured response
 * Step 4 - Generate embedding
 * Step 5 - Return result
 */
export async function curateContent(
  ai: Ai,
  db: D1Database,
  model: string,
  request: CurationRequest
): Promise<CurationResult> {
  const logger = createLogger(db, 'CuratorService');
  const start = Date.now();

  try {
    // Step 1 - Build prompt
    const { instructions, prompt } = buildCurationPrompt(request);

    // Step 2 - Call AI model
    const payload = createAiPayload(model, instructions, prompt); // Creates the payload that the selected model expects; currently only support gpt-oss-120b and llama3 generally.
    const response = await ai.run(model, payload);

    // Step 3 - Parse response
    const parsed = parseCurationResponse(response);

    // Step 4 - Generate embedding
    const embedding = await generateEmbedding(ai, request.content);

    await logger.info('CURATION_SUCCESS', {
      itemId: request.itemId,
      source: request.source,
      score: parsed.score,
      durationMs: Date.now() - start,
    });

    return {
      ...parsed,
      embedding,
    };
  } catch (error) {
    await logger.error('CURATION_FAILED', error, {
      itemId: request.itemId,
      source: request.source,
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

/**
 * Insert item embedding into Vectorize
 */
export async function insertEmbedding(
  vec: VectorizeIndex,
  itemId: string,
  embedding: number[],
  metadata: Record<string, unknown>
): Promise<string> {
  const vectorId = `item-${itemId}`;

  await vec.upsert([
    {
      id: vectorId,
      values: embedding,
      metadata,
    },
  ]);

  return vectorId;
}

/**
 * Search similar items by embedding
 */
export async function searchSimilar(
  vec: VectorizeIndex,
  query: string,
  ai: Ai,
  topK = 10
): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
  // Generate query embedding
  const embedding = await generateEmbedding(ai, query);

  // Search Vectorize
  const results = await vec.query(embedding, { topK });

  return results.matches.map((match) => ({
    id: match.id.replace('item-', ''), // remove prefix
    score: match.score,
    metadata: match.metadata || {},
  }));
}

/**
 * Answer question about an item
 *
 * Step 1 - Fetch item from DB
 * Step 2 - Optionally fetch related items via vector search
 * Step 3 - Build Q&A prompt with context
 * Step 4 - Call AI model
 * Step 5 - Extract answer and citations
 */
export async function answerQuestion(
  ai: Ai,
  vec: VectorizeIndex,
  db: D1Database,
  model: string,
  request: QARequest,
  getItemById: (id: string) => Promise<Item | null>
): Promise<QAResponse> {
  const logger = createLogger(db, 'CuratorService');
  const start = Date.now();

  try {
    // Step 1 - Fetch item
    const item = await getItemById(request.itemId);
    if (!item) {
      throw new Error(`Item not found: ${request.itemId}`);
    }

    // Step 2 - Fetch related items (optional)
    let relatedItems: Item[] = [];
    if (request.includeRelated) {
      const similar = await searchSimilar(vec, request.question, ai, 5);
      const relatedIds = similar.filter((s) => s.id !== request.itemId).map((s) => s.id);

      for (const id of relatedIds) {
        const related = await getItemById(id);
        if (related) relatedItems.push(related);
      }
    }

    // Step 3 - Build prompt
    const { instructions, prompt } = buildQAPrompt(item, request.question, relatedItems);

    // Step 4 - Call AI
    const payload = createAiPayload(model, instructions, prompt); // Creates the payload that the selected model expects; currently only support gpt-oss-120b and llama3 generally.
    const response = await ai.run(model, payload);

    // Step 5 - Parse response
    const answer = parseQAResponse(response);

    await logger.info('QA_SUCCESS', {
      itemId: request.itemId,
      userId: request.userId,
      durationMs: Date.now() - start,
    });

    return {
      answer,
      citations: [item.url],
      relatedItems: request.includeRelated ? relatedItems : undefined,
      model,
    };
  } catch (error) {
    await logger.error('QA_FAILED', error, {
      itemId: request.itemId,
      userId: request.userId,
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

/**
 * Generate text embedding
 */
async function generateEmbedding(ai: Ai, text: string): Promise<number[]> {
  const model = '@cf/baai/bge-large-en-v1.5';
  
  // 1. Chunk the text into pieces that fit the model's 512-token limit
  // (Using ~400 words as a safe proxy)
  const chunks = chunkText(text, 400);

  if (chunks.length === 0) {
    console.warn('No content to embed.');
    return [];
  }

  // 2. Get embeddings for all chunks in a single batch
  const response = await ai.run(model, {
    text: chunks,
  });

  // @ts-ignore - Workers AI types are not always up-to-date
  const allEmbeddings: number[][] = response.data;

  if (!allEmbeddings || allEmbeddings.length === 0) {
    throw new Error('Failed to generate embeddings');
  }

  // 3. Average the embeddings to get a single vector for the document
  return averageEmbeddings(allEmbeddings);
}

/**
 * Build curation prompt
 */
function buildCurationPrompt(request: CurationRequest): { instructions: string; prompt: string } {
  const instructions = `You are an expert content curator. Analyze the following content and respond in this exact JSON format:
{
  "summary": "A concise summary (2-3 sentences)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "reason": "Why this is interesting/valuable (1 sentence)",
  "score": 0.85 //[quality score from 0.0 to 1.0 (1.0 = exceptional, 0.5 = good, 0.0 = poor)]
}`;

  const prompt = `Analyze this ${request.source} content:
    Title: ${request.title}
    URL: ${request.url}
    Content: ${request.content.slice(0, 5000)}
  `;

  return { instructions, prompt };
}

/**
 * Parse AI curation response
 */
function parseCurationResponse(response: any): Omit<CurationResult, 'embedding'> {
  try {
    // Extract JSON from response
    let text = typeof response === 'string' ? response : response.response || JSON.stringify(response);

    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || 'No summary available',
        tags: parsed.tags || [],
        reason: parsed.reason || 'Interesting content',
        score: Math.max(0, Math.min(1, parsed.score || 0.5)),
      };
    }

    throw new Error('No valid JSON found in response');
  } catch (error) {
    console.error('[PARSE_ERROR]', error, response);
    // Fallback
    return {
      summary: 'Summary unavailable',
      tags: [],
      reason: 'Content requires review',
      score: 0.3,
    };
  }
}

/**
 * Build Q&A prompt
 */
function buildQAPrompt(
  item: Item,
  question: string,
  relatedItems: Item[]
): { instructions: string; prompt: string } {
  const instructions = `You are a helpful assistant answering questions about curated content.
Provide a clear, accurate answer based on the context below.
If you cannot answer from the given context, say so.
Keep your answer concise (2-3 sentences).`;

  let context = `Main Item:
Title: ${item.title}
URL: ${item.url}
Summary: ${item.summary || 'N/A'}
Tags: ${item.tags?.join(', ') || 'N/A'}
`;

  if (relatedItems.length > 0) {
    context += `\nRelated Items:\n`;
    relatedItems.forEach((r, i) => {
      context += `${i + 1}. ${r.title} (${r.url})\n   ${r.summary || 'N/A'}\n`;
    });
  }

  const prompt = `${context}\nQuestion: ${question}\n\nAnswer:`;

  return { instructions, prompt };
}

/**
 * Parse Q&A response
 */
function parseQAResponse(response: any): string {
  if (typeof response === 'string') {
    return response.trim();
  }

  if (response.response) {
    return response.response.trim();
  }

  return JSON.stringify(response);
}
