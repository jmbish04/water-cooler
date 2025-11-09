import { z } from "zod";
import { dispatchRPC, rpcRegistry } from "./rpc";
import type { Env } from "./types";

const ExecuteBody = z.object({
  tool: z.string(),
  params: z.any(),
});

export const mcpRoutes = {
  /**
   * Lists the available tools, derived from the rpcRegistry.
   * This endpoint is compliant with the Model Context Protocol.
   */
  tools: async () => {
    const tools = Object.keys(rpcRegistry).map((name) => ({
      name,
      description: `A tool for the action: ${name}`,
      // In a more advanced implementation, you could generate a JSON schema
      // from the Zod input schema for each RPC method.
    }));
    return { tools };
  },

  /**
   * Executes a tool, identified by its name.
   * The request body should be a JSON object with `tool` and `params` properties.
   */
  execute: async (env: Env, ctx: ExecutionContext, body: unknown) => {
    const parsedBody = ExecuteBody.safeParse(body);
    if (!parsedBody.success) {
      throw new z.ZodError(parsedBody.error.issues);
    }

    const { tool, params } = parsedBody.data;
    const result = await dispatchRPC(tool, params, env, ctx);
    return { success: true, result };
  },
};
