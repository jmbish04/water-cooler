/**
 * Curator Actor (Durable Object)
 *
 * Purpose:
 * - Process individual items for AI curation
 * - Generate summaries, tags, reasons, scores
 * - Create embeddings and insert into Vectorize
 * - Store curated items in D1
 *
 * AI Agent Hints:
 * - One instance per curation job (transient)
 * - Stateless processing (no storage)
 * - Logs all operations to audit_logs
 * - Returns CurationResult
 *
 * Endpoints:
 * - POST /curate - Curate a single item
 */

import { Env } from '../types/env';
import { CurationRequest } from '../types/domain';
import { curateContent, insertEmbedding } from '../services/curator';
import { createItem } from '../services/db';
import { createLogger } from '../utils/logger';
import { getAIModel } from '../types/env';
import { normalizeBadges, linkBadgesToItem } from '../services/badges';

export class CuratorActor implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/curate') {
      return this.curate(request);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Curate a single item
   *
   * Step 1 - Parse request body
   * Step 2 - Call AI curation service
   * Step 3 - Insert embedding into Vectorize
   * Step 4 - Normalize tags to badges
   * Step 5 - Create item in D1
   * Step 6 - Link badges to item
   * Step 7 - Return result
   */
  private async curate(request: Request): Promise<Response> {
    const logger = createLogger(this.env.DB, 'CuratorActor');
    const start = Date.now();

    try {
      // Step 1 - Parse request
      const curationRequest: CurationRequest & { sourceId: number } = await request.json();

      // Step 2 - Curate with AI
      const model = getAIModel(this.env);
      const result = await curateContent(
        this.env.AI,
        this.env.DB,
        model,
        curationRequest
      );

      // Step 3 - Insert embedding
      let vectorId: string | null = null;
      if (result.embedding) {
        vectorId = await insertEmbedding(
          this.env.VEC,
          curationRequest.itemId,
          result.embedding,
          {
            title: curationRequest.title,
            url: curationRequest.url,
            source: curationRequest.source,
          }
        );
      }

      // Step 4 - Normalize tags to badges
      const badgeIds = await normalizeBadges(this.env.DB, result.tags);

      // Step 5 - Create item in D1
      // Merge source into metadata
      const metadata = {
        ...(curationRequest.metadata || {}),
        source: curationRequest.source,
      };

      const item = await createItem(this.env.DB, {
        sourceId: curationRequest.sourceId,
        title: curationRequest.title,
        url: curationRequest.url,
        summary: result.summary,
        tags: result.tags, // Keep legacy tags for backwards compatibility
        reason: result.reason,
        score: result.score,
        aiQuestions: result.questions || [],
        vectorId,
        metadata,
      });

      // Step 6 - Link badges to item
      await linkBadgesToItem(this.env.DB, item.id, badgeIds);

      await logger.info('CURATION_COMPLETED', {
        itemId: item.id,
        source: curationRequest.source,
        score: result.score,
        badgeCount: badgeIds.length,
        questionCount: result.questions?.length || 0,
        durationMs: Date.now() - start,
      });

      // Step 7 - Return result
      return new Response(JSON.stringify({ success: true, item }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      await logger.error('CURATION_FAILED', error, {
        durationMs: Date.now() - start,
      });

      return new Response(
        JSON.stringify({ error: 'Curation failed', message: String(error) }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }
}
