/**
 * Cloudflare Agent SDK - Content Enrichment Agent
 *
 * Purpose:
 * - Process new content entries asynchronously
 * - Call Cloudflare Workers AI to generate metadata
 * - Store normalized badges and AI-generated data
 * - Handle long-running enrichment jobs
 *
 * AI Agent Hints:
 * - Uses @cloudflare/agents for async workflow orchestration
 * - Generates: summary, tags (normalized to badges), score (0-100), questions
 * - Stores results in D1 with proper relationships
 *
 * Flow:
 * 1. Receive entry ID and content via agent input
 * 2. Call AI model (@cf/openai/gpt-oss-120b) for enrichment
 * 3. Parse structured response (summary, tags, score, questions)
 * 4. Normalize tags to badges (create if needed)
 * 5. Insert/update entry_badges relationships
 * 6. Update item with AI metadata
 */

import { agent } from '@cloudflare/agents';
import type { Env } from '../types/env';

/**
 * Agent input schema
 */
interface EnrichmentInput {
  entryId: string;
  title: string;
  url: string;
  content: string;
  source: string;
}

/**
 * AI response schema
 */
interface AIEnrichmentResponse {
  summary: string;
  tags: string[];
  score: number; // 0-100
  questions: string[];
}

/**
 * Content Enrichment Agent
 *
 * Processes content through AI and stores enriched metadata
 */
export default agent<Env, EnrichmentInput>(async (context) => {
  const { entryId, title, url, content, source } = context.inputs;
  const ai = new Ai(context.env.AI);
  const db = context.env.DB;

  console.log(`[EnrichAgent] Processing entry: ${entryId}`);

  try {
    // Step 1 - Build AI prompt
    const prompt = buildEnrichmentPrompt(title, url, content, source);

    // Step 2 - Call AI model
    const aiResponse = await ai.run('@cf/openai/gpt-oss-120b', {
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      reasoning: { effort: 'medium' },
    });

    // Step 3 - Parse AI response
    const parsed = parseAIResponse(aiResponse);
    console.log(`[EnrichAgent] AI analysis complete:`, {
      score: parsed.score,
      tagCount: parsed.tags.length,
      questionCount: parsed.questions.length,
    });

    // Step 4 - Normalize tags to badges
    const badgeIds = await normalizeBadges(db, parsed.tags);
    console.log(`[EnrichAgent] Normalized ${parsed.tags.length} tags to ${badgeIds.length} badges`);

    // Step 5 - Update entry with AI metadata
    await db
      .prepare(
        `UPDATE items
         SET summary = ?,
             score = ?,
             ai_questions = ?,
             updatedAt = datetime('now')
         WHERE id = ?`
      )
      .bind(
        parsed.summary,
        parsed.score,
        JSON.stringify(parsed.questions),
        entryId
      )
      .run();

    // Step 6 - Link badges to entry
    await linkBadgesToEntry(db, entryId, badgeIds);

    console.log(`[EnrichAgent] Successfully enriched entry: ${entryId}`);

    return {
      success: true,
      entryId,
      metadata: {
        summary: parsed.summary,
        score: parsed.score,
        badgeCount: badgeIds.length,
        questionCount: parsed.questions.length,
      },
    };
  } catch (error) {
    console.error(`[EnrichAgent] Failed to enrich entry ${entryId}:`, error);

    // Store error in audit logs
    await db
      .prepare(
        `INSERT INTO audit_logs (level, scope, event, detail, itemId, errorStack)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'ERROR',
        'EnrichAgent',
        'ENRICHMENT_FAILED',
        JSON.stringify({ entryId, error: String(error) }),
        entryId,
        error instanceof Error ? error.stack : null
      )
      .run();

    throw error;
  }
});

/**
 * Build enrichment prompt
 */
function buildEnrichmentPrompt(
  title: string,
  url: string,
  content: string,
  source: string
): string {
  return `You are an expert content curator analyzing ${source} content.

Analyze the following content and return a JSON object with these exact fields:
- summary: A concise 1-2 sentence summary
- tags: An array of up to 5 short, relevant topic tags (e.g., ["AI", "Web", "Security"])
- score: A quality/relevance score from 0 to 100 (100 = exceptional, 50 = good, 0 = poor)
- questions: An array of exactly 3 insightful follow-up questions users might ask

Content to analyze:
Title: ${title}
URL: ${url}
Content: ${content.slice(0, 5000)}

Return ONLY valid JSON in this exact format:
{
  "summary": "Your 1-2 sentence summary here",
  "tags": ["tag1", "tag2", "tag3"],
  "score": 75,
  "questions": [
    "Question 1?",
    "Question 2?",
    "Question 3?"
  ]
}`;
}

/**
 * Parse AI response into structured format
 */
function parseAIResponse(response: any): AIEnrichmentResponse {
  try {
    // Extract text from various response formats
    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else if (response && typeof response === 'object') {
      text =
        response.response ||
        response.text ||
        response.content ||
        response.output ||
        '';

      // OpenAI-style response
      if (response.choices?.[0]?.message?.content) {
        text = response.choices[0].message.content;
      }
    }

    if (!text) {
      throw new Error('No text content in AI response');
    }

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize
    return {
      summary: parsed.summary || 'Summary unavailable',
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
      score: Math.max(0, Math.min(100, parseInt(parsed.score) || 50)),
      questions: Array.isArray(parsed.questions)
        ? parsed.questions.slice(0, 3)
        : [],
    };
  } catch (error) {
    console.error('[EnrichAgent] Parse error:', error);
    // Fallback with sensible defaults
    return {
      summary: 'Content analysis unavailable',
      tags: [],
      score: 50,
      questions: [],
    };
  }
}

/**
 * Normalize tags to badges
 *
 * For each tag:
 * 1. Check if badge exists (case-insensitive)
 * 2. If not, create new badge
 * 3. Return array of badge IDs
 */
async function normalizeBadges(
  db: D1Database,
  tags: string[]
): Promise<number[]> {
  const badgeIds: number[] = [];

  // Fetch all existing badges
  const existingBadgesResult = await db
    .prepare('SELECT id, name FROM badges')
    .all();
  const existingBadges = existingBadgesResult.results as Array<{
    id: number;
    name: string;
  }>;

  for (const tag of tags) {
    const normalizedTag = tag.trim();
    if (!normalizedTag) continue;

    // Check if badge exists (case-insensitive)
    let badge = existingBadges.find(
      (b) => b.name.toLowerCase() === normalizedTag.toLowerCase()
    );

    if (!badge) {
      // Create new badge
      const insertResult = await db
        .prepare(
          'INSERT INTO badges (name, description) VALUES (?, ?) RETURNING id'
        )
        .bind(normalizedTag, `Auto-generated badge for ${normalizedTag}`)
        .first<{ id: number }>();

      if (insertResult?.id) {
        badgeIds.push(insertResult.id);
        // Add to cache for subsequent tags
        existingBadges.push({ id: insertResult.id, name: normalizedTag });
      }
    } else {
      badgeIds.push(badge.id);
    }
  }

  return badgeIds;
}

/**
 * Link badges to entry
 *
 * 1. Delete existing entry_badges for this entry
 * 2. Insert new entry_badges relationships
 */
async function linkBadgesToEntry(
  db: D1Database,
  entryId: string,
  badgeIds: number[]
): Promise<void> {
  // Delete existing relationships
  await db
    .prepare('DELETE FROM entry_badges WHERE entry_id = ?')
    .bind(entryId)
    .run();

  // Insert new relationships
  for (const badgeId of badgeIds) {
    await db
      .prepare('INSERT INTO entry_badges (entry_id, badge_id) VALUES (?, ?)')
      .bind(entryId, badgeId)
      .run();
  }
}
