import { buildRouter } from "./router";
import { RoomDO } from "./do/RoomDO";
import { buildOpenAPIDocument } from "./utils/openapi";
import { mcpRoutes } from "./mcp";
import type { Env } from "./types";
import YAML from "yaml";

/**
 * The main entry point for the Cloudflare Worker.
 * This handler routes requests to the appropriate handlers based on the request path and headers.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // OpenAPI documentation endpoints.
    // The documentation is generated dynamically from the Zod schemas.
    if (url.pathname === "/openapi.json") {
      const doc = buildOpenAPIDocument(url.origin);
      return new Response(JSON.stringify(doc, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/openapi.yaml") {
      const doc = buildOpenAPIDocument(url.origin);
      const yaml = YAML.stringify(doc);
      return new Response(yaml, {
        headers: { "Content-Type": "application/yaml" },
      });
    }

    // WebSocket upgrade endpoint.
    // Requests to /ws are delegated to the RoomDO Durable Object.
    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const projectId = url.searchParams.get("projectId") ?? "default";
      const id = env.ROOM_DO.idFromName(projectId);
      const stub = env.ROOM_DO.get(id);
      return stub.fetch(request);
    }

    // Model Context Protocol (MCP) endpoints.
    if (url.pathname.startsWith("/mcp/")) {
      if (url.pathname === "/mcp/tools" && request.method === "GET") {
        const tools = await mcpRoutes.tools();
        return new Response(JSON.stringify(tools), { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/mcp/execute" && request.method === "POST") {
        try {
          const body = await request.json();
          const result = await mcpRoutes.execute(env, ctx, body);
          return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return new Response("MCP endpoint not found", { status: 404 });
    }

    // For all other requests, delegate to the Hono router.
    // This handles the REST API and the generic RPC endpoint.
    const app = buildRouter();
    return app.fetch(request, env, ctx);
  },
};

// Export the Durable Object class for wrangler.
export { RoomDO };
