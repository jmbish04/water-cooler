/**
 * GitHub Actor (Durable Object)
 *
 * Purpose:
 * - Fetch repositories from GitHub based on source config
 * - Enqueue items for curation
 * - Track processed repos to avoid duplicates
 *
 * AI Agent Hints:
 * - One instance per GitHub source
 * - Stores processed repo URLs in Durable Storage
 * - Triggers CuratorActor for each new repo
 * - Logs all fetches to audit_logs
 *
 * Endpoints:
 * - POST /scan - Scan GitHub source
 */

import { Env } from '../types/env';
import { GitHubConfig } from '../types/domain';
import { fetchGitHubRepos } from '../services/github';
import { createLogger } from '../utils/logger';
import { generateItemId } from '../utils/hash';

export class GitHubActor implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/scan') {
      return this.scan(request);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Scan GitHub source
   *
   * Step 1 - Parse config from request
   * Step 2 - Fetch repos from GitHub
   * Step 3 - Check for duplicates
   * Step 4 - Enqueue new items for curation
   * Step 5 - Update processed set
   */
  private async scan(request: Request): Promise<Response> {
    const logger = createLogger(this.env.DB, 'GitHubActor');
    const start = Date.now();

    try {
      const { sourceId, config } = await request.json<{
        sourceId: number;
        config: GitHubConfig;
      }>();

      // Step 2 - Fetch repos
      const repos = await fetchGitHubRepos(config, this.env.CACHE, this.env.GITHUB_TOKEN);

      // Step 3 - Get processed URLs
      const processed = (await this.state.storage.get<Set<string>>('processed')) || new Set();

      // Step 4 - Enqueue new repos
      let newCount = 0;
      for (const repo of repos) {
        if (!processed.has(repo.url)) {
          const itemId = await generateItemId(sourceId, repo.url);

          // Trigger curator
          const curatorId = this.env.CURATOR_ACTOR.idFromName(itemId);
          const curatorStub = this.env.CURATOR_ACTOR.get(curatorId);

          await curatorStub.fetch('http://curator/curate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemId,
              sourceId,
              source: 'github',
              title: repo.title,
              url: repo.url,
              content: repo.content,
              metadata: repo.metadata,
            }),
          });

          processed.add(repo.url);
          newCount++;
        }
      }

      // Step 5 - Update processed set
      await this.state.storage.put('processed', processed);

      await logger.info('GITHUB_SCAN_COMPLETED', {
        sourceId,
        totalRepos: repos.length,
        newRepos: newCount,
        durationMs: Date.now() - start,
      });

      return new Response(
        JSON.stringify({
          success: true,
          scanned: repos.length,
          new: newCount,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      await logger.error('GITHUB_SCAN_FAILED', error, {
        durationMs: Date.now() - start,
      });

      return new Response(
        JSON.stringify({ error: 'Scan failed', message: String(error) }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }
}
