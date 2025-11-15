/**
 * User Session Actor (Durable Object)
 *
 * Purpose:
 * - Track per-user read/star/followup state
 * - Store user preferences in Durable Storage
 * - Provide fast user-specific queries
 *
 * AI Agent Hints:
 * - One instance per userId
 * - Caches user actions in memory
 * - Syncs with D1 periodically
 * - Provides low-latency read/write for user data
 *
 * Endpoints:
 * - GET /actions - Get user actions
 * - POST /action - Record action
 * - GET /preferences - Get preferences
 * - POST /preferences - Update preferences
 */

import { Env } from '../types/env';
import { UserPreferenceUpdateSchema, UserActionPayloadSchema } from '../types/domain';
import { ZodError } from 'zod';
import {
  getUserPreferences,
  recordUserAction,
  upsertUserPreferences,
} from '../services/db';
import { createLogger } from '../utils/logger';

export class UserSessionActor implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private userId: string;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.userId = state.id.toString();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/action') {
      return this.recordAction(request);
    }

    if (request.method === 'GET' && url.pathname === '/preferences') {
      return this.getPreferences();
    }

    if (request.method === 'POST' && url.pathname === '/preferences') {
      return this.updatePreferences(request);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Record user action (read, star, followup)
   */
  private async recordAction(request: Request): Promise<Response> {
    const logger = createLogger(this.env.DB, 'UserSessionActor');

    try {
      const payload = await request.json<unknown>();
      const { itemId, action } = UserActionPayloadSchema.parse(payload);

      // Write to D1
      await recordUserAction(this.env.DB, {
        itemId,
        userId: this.userId,
        action,
      });

      // Cache in Durable Storage
      const actionsKey = `actions:${action}`;
      const actions = (await this.state.storage.get<Set<string>>(actionsKey)) || new Set();
      actions.add(itemId);
      await this.state.storage.put(actionsKey, actions);

      await logger.info('USER_ACTION', {
        userId: this.userId,
        itemId,
        action,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return this.handleZodError(logger, 'INVALID_SESSION_ACTION', 'Invalid action payload', error);
      }

      await logger.error('USER_ACTION_FAILED', error, {
        userId: this.userId,
      });

      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  /**
   * Get user preferences
   */
  private async getPreferences(): Promise<Response> {
    try {
      const prefs = await getUserPreferences(this.env.DB, this.userId);

      return new Response(JSON.stringify(prefs || {}), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  /**
   * Update user preferences
   */
  private async updatePreferences(request: Request): Promise<Response> {
    const logger = createLogger(this.env.DB, 'UserSessionActor');

    try {
      const payload = await request.json<unknown>();
      const prefs = UserPreferenceUpdateSchema.parse(payload);

      await upsertUserPreferences(this.env.DB, this.userId, prefs);

      await logger.info('PREFERENCES_UPDATED', {
        userId: this.userId,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return this.handleZodError(
          logger,
          'INVALID_PREFERENCES_PAYLOAD',
          'Invalid preferences payload',
          error
        );
      }

      await logger.error('PREFERENCES_UPDATE_FAILED', error, {
        userId: this.userId,
      });

      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  private async handleZodError(
    logger: ReturnType<typeof createLogger>,
    event: string,
    message: string,
    error: ZodError
  ): Promise<Response> {
    await logger.warn(
      event,
      { details: error.issues },
      { userId: this.userId }
    );

    return new Response(
      JSON.stringify({
        error: message,
        details: error.issues,
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
