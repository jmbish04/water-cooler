/**
 * API Routes
 *
 * Purpose:
 * - RESTful endpoints for items, search, actions, config
 * - Zod validation for all inputs
 * - Integration with actors and services
 *
 * AI Agent Hints:
 * - All routes validated with Zod schemas
 * - Returns standardized JSON responses
 * - Logs all operations to audit_logs
 *
 * Routes:
 * - GET /api/items - List items with filters
 * - GET /api/search - Semantic + keyword search
 * - POST /api/items/:id/ask - Q&A about item
 * - POST /api/star/:id - Star/unstar item
 * - POST /api/followup/:id - Add/remove from follow-up
 * - POST /api/mark-read/:id - Mark as read
 * - POST /api/config - Update source config
 * - POST /api/scan - Trigger manual scan
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../types/env';
import {
  GetItemsQuerySchema,
  SearchQuerySchema,
  AskQuestionBodySchema,
  StarItemBodySchema,
  FollowupItemBodySchema,
  MarkReadBodySchema,
  UpdateConfigBodySchema,
  TriggerScanBodySchema,
} from '../types/api';
import { getItems, getItemById, getSources, createSource } from '../services/db';
import { searchSimilar, answerQuestion } from '../services/curator';
import { jsonOk, jsonError, notFound } from '../utils/response';
import { getUserId } from './middleware';
import { getAIModel } from '../types/env';

const api = new Hono<{ Bindings: Env }>();

/**
 * GET /api/items
 * List items with filters
 */
api.get('/items', zValidator('query', GetItemsQuerySchema), async (c) => {
  try {
    const query = c.req.valid('query');
    const userId = getUserId(c);

    const result = await getItems(c.env.DB, {
      ...query,
      userId,
    });

    return jsonOk(c, {
      items: result.items,
      total: result.total,
      offset: query.offset || 0,
      limit: query.limit || 50,
    });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

/**
 * GET /api/search
 * Semantic + keyword search
 */
api.get('/search', zValidator('query', SearchQuerySchema), async (c) => {
  try {
    const query = c.req.valid('query');
    const userId = getUserId(c);

    // Use vector search for semantic query
    const similar = await searchSimilar(c.env.VEC, query.q, c.env.AI, query.limit || 20);

    // Fetch full items from DB
    const items = [];
    for (const match of similar) {
      const item = await getItemById(c.env.DB, match.id);
      if (item) {
        items.push(item);
      }
    }

    return jsonOk(c, {
      items,
      total: items.length,
      offset: 0,
      limit: query.limit || 20,
    });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

/**
 * POST /api/items/:id/ask
 * Ask AI a question about an item
 */
api.post('/items/:id/ask', zValidator('json', AskQuestionBodySchema), async (c) => {
  try {
    const itemId = c.req.param('id');
    const body = c.req.valid('json');
    const userId = getUserId(c);

    const model = getAIModel(c.env);
    const response = await answerQuestion(
      c.env.AI,
      c.env.VEC,
      c.env.DB,
      model,
      {
        itemId,
        question: body.question,
        userId,
        includeRelated: body.includeRelated,
      },
      (id) => getItemById(c.env.DB, id)
    );

    return jsonOk(c, response);
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

/**
 * POST /api/star/:id
 * Star or unstar an item
 */
api.post('/star/:id', zValidator('json', StarItemBodySchema), async (c) => {
  try {
    const itemId = c.req.param('id');
    const { starred } = c.req.valid('json');
    const userId = getUserId(c);

    // Get user session actor
    const sessionId = c.env.USER_SESSION_ACTOR.idFromName(userId);
    const sessionStub = c.env.USER_SESSION_ACTOR.get(sessionId);

    await sessionStub.fetch('http://session/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId,
        action: starred ? 'star' : 'unstar',
      }),
    });

    return jsonOk(c, { success: true, action: starred ? 'star' : 'unstar', itemId });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

/**
 * POST /api/followup/:id
 * Add or remove from follow-up list
 */
api.post('/followup/:id', zValidator('json', FollowupItemBodySchema), async (c) => {
  try {
    const itemId = c.req.param('id');
    const { followup } = c.req.valid('json');
    const userId = getUserId(c);

    const sessionId = c.env.USER_SESSION_ACTOR.idFromName(userId);
    const sessionStub = c.env.USER_SESSION_ACTOR.get(sessionId);

    await sessionStub.fetch('http://session/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId,
        action: 'followup',
      }),
    });

    return jsonOk(c, { success: true, action: 'followup', itemId });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

/**
 * POST /api/mark-read/:id
 * Mark item as read
 */
api.post('/mark-read/:id', zValidator('json', MarkReadBodySchema), async (c) => {
  try {
    const itemId = c.req.param('id');
    const { read } = c.req.valid('json');
    const userId = getUserId(c);

    if (read) {
      const sessionId = c.env.USER_SESSION_ACTOR.idFromName(userId);
      const sessionStub = c.env.USER_SESSION_ACTOR.get(sessionId);

      await sessionStub.fetch('http://session/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          action: 'read',
        }),
      });
    }

    return jsonOk(c, { success: true, action: 'read', itemId });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

/**
 * GET /api/sources
 * Get all sources
 */
api.get('/sources', async (c) => {
  try {
    const sources = await getSources(c.env.DB);
    return jsonOk(c, { sources });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

/**
 * POST /api/config
 * Update source configuration
 */
api.post('/config', zValidator('json', UpdateConfigBodySchema), async (c) => {
  try {
    const { sources } = c.req.valid('json');

    for (const source of sources) {
      await createSource(c.env.DB, source);
    }

    return jsonOk(c, { success: true, count: sources.length });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

/**
 * POST /api/scan
 * Trigger manual scan
 */
api.post('/scan', zValidator('json', TriggerScanBodySchema), async (c) => {
  try {
    const { sourceId } = c.req.valid('json');

    // Trigger scheduler
    const schedulerId = c.env.SCHEDULER_ACTOR.idFromName('scheduler');
    const schedulerStub = c.env.SCHEDULER_ACTOR.get(schedulerId);

    const response = await schedulerStub.fetch('http://scheduler/trigger', {
      method: 'POST',
    });

    const result = await response.json();

    return jsonOk(c, result);
  } catch (error) {
    return jsonError(c, error instanceof Error ? error : String(error), 500);
  }
});

export default api;
