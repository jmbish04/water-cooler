import { Hono } from "hono";
import { cors } from "hono/cors";
import { dispatchRPC } from "./rpc";
import type { Env } from "./types";

/**
 * Builds and configures the Hono router for the REST API.
 */
export function buildRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Apply CORS middleware to all /api/ routes.
  // This allows cross-origin requests from web applications.
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

  /**
   * Endpoint for creating a new task.
   * Delegates to the "createTask" RPC method.
   */
  app.post("/api/tasks", async (c) => {
    try {
      const body = await c.req.json();
      const result = await dispatchRPC("createTask", body, c.env, c.executionCtx);
      return c.json(result);
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  /**
   * Endpoint for listing all tasks.
   * Delegates to the "listTasks" RPC method.
   */
  app.get("/api/tasks", async (c) => {
    try {
      const result = await dispatchRPC("listTasks", null, c.env, c.executionCtx);
      return c.json(result);
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  /**
   * Endpoint for running an analysis.
   * Delegates to the "runAnalysis" RPC method.
   */
  app.post("/api/analyze", async (c) => {
    try {
      const body = await c.req.json();
      const result = await dispatchRPC("runAnalysis", body, c.env, c.executionCtx);
      return c.json(result);
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  /**
   * A generic RPC endpoint for direct method calls.
   * This is useful for testing and for clients that prefer an RPC-style interaction over REST.
   */
  app.post("/rpc", async (c) => {
    try {
      const { method, params } = await c.req.json<{ method: string; params: unknown }>();
      const result = await dispatchRPC(method, params, c.env, c.executionCtx);
      return c.json({ success: true, result });
    } catch (e: any) {
      return c.json({ success: false, error: e.message ?? "An RPC error occurred" }, 400);
    }
  });

  return app;
}
