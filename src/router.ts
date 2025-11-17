import { Hono } from "hono";
import { cors } from "hono/cors";
import { dispatchRPC } from "./rpc";
import type { Env } from "./types";
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import * as S from './schemas/apiSchemas';
import { z } from 'zod';

const AnnotateBody = z.object({
  title: z.string(),
  url: z.string().optional(),
  content: z.string().optional()
});

/**
 * Builds and configures the Hono router for the REST API.
 */
export function buildRouter() {
  const app = new OpenAPIHono<{ Bindings: Env }>();

  // Apply CORS middleware to all /api/ routes.
  app.use("/api/*", cors());

  /**
   * A simple health check endpoint.
   */
  app.get("/", (c) => {
    return c.json({
      ok: true,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  const createTaskRoute = createRoute({
    method: 'post',
    path: '/api/tasks',
    request: {
      body: {
        content: {
          'application/json': {
            schema: S.CreateTaskRequest,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: S.CreateTaskResponse,
          },
        },
        description: 'Task created successfully',
      },
    },
  });

  app.openapi(createTaskRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await dispatchRPC("createTask", body, c.env, c.executionCtx);
    return c.json(result);
  });

  const listTasksRoute = createRoute({
    method: 'get',
    path: '/api/tasks',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: S.ListTasksResponse,
          },
        },
        description: 'List of tasks',
      },
    },
  });

  app.openapi(listTasksRoute, async (c) => {
    const result = await dispatchRPC("listTasks", null, c.env, c.executionCtx);
    return c.json(result);
  });

  const runAnalysisRoute = createRoute({
    method: 'post',
    path: '/api/analyze',
    request: {
      body: {
        content: {
          'application/json': {
            schema: S.AnalysisRequest,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: S.AnalysisResponse,
          },
        },
        description: 'Analysis complete',
      },
    },
  });

  app.openapi(runAnalysisRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await dispatchRPC("runAnalysis", body, c.env, c.executionCtx);
    return c.json(result);
  });

  app.post("/rpc", async (c) => {
    try {
      const { method, params } = await c.req.json<{ method: string; params: unknown }>();
      const result = await dispatchRPC(method, params, c.env, c.executionCtx);
      return c.json({ success: true, result });
    } catch (e: any) {
      return c.json({ success: false, error: e.message ?? "An RPC error occurred" }, 400);
    }
  });

  const annotateRoute = createRoute({
    method: 'post',
    path: '/ai/annotate',
    request: {
      body: {
        content: {
          'application/json': {
            schema: AnnotateBody,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              category: z.string(),
              score: z.number(),
              summary: z.string(),
            }),
          },
        },
        description: 'Annotation complete',
      },
    },
  });

  app.openapi(annotateRoute, async (c) => {
    const body = c.req.valid('json');

    const prompt = [
      "You are an annotation service. Return STRICT JSON with keys: category (string), score (0-100 integer), summary (<=220 chars).",
      "Choose a precise, human-meaningful category. Score is relevance/quality.",
      "Input:",
      `Title: ${body.title}`,
      body.url ? `URL: ${body.url}` : "",
      body.content ? `Content:\n${body.content}` : ""
    ].join("\n");

    const cache = caches.default;
    const cacheUrl = new URL(c.req.url);
    cacheUrl.pathname = '/ai/annotate';
    cacheUrl.search = new URLSearchParams({ t: body.title }).toString();
    const key = new Request(cacheUrl, { method: 'GET' });
    const cached = await cache.match(key);
    if (cached) return cached;

    const model = '@cf/meta/llama-3.1-8b-instruct';
    const raw = await c.env.AI.run(model, { prompt, max_tokens: 220, temperature: 0.2 });

    let data: { category: string; score: number; summary: string };
    try {
      const text = typeof raw === 'string' ? raw : (raw?.response ?? JSON.stringify(raw));
      const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
      data = JSON.parse(jsonStr);
    } catch (e) {
      data = { category: 'Uncategorized', score: 50, summary: body.title };
    }

    const res = new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=21600' }
    });

    const cachePut = cache.put(key, res.clone());
    if (typeof c.executionCtx?.waitUntil === 'function') {
      c.executionCtx.waitUntil(cachePut);
    } else {
      await cachePut;
    }

    return res;
  });

  return app;
}
