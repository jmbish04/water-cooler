import { z } from "zod";
import * as S from "./schemas/apiSchemas";
import type { Env } from "./types";

const createTask = async (params: unknown) => {
    const input = S.CreateTaskRequest.parse(params);
    const task = {
        id: crypto.randomUUID(),
        title: input.title,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
    };
    return { success: true as const, task };
};

const listTasks = async () => {
    // In a real app, you'd fetch this from a database.
    return { success: true as const, tasks: [] };
};

const runAnalysis = async (params: unknown) => {
    const input = S.AnalysisRequest.parse(params);
    // In a real app, you'd do some work here.
    return { success: true as const, report: { taskId: input.taskId, score: 0.82, notes: "Analysis complete." } };
};

export const rpcRegistry: Record<string, (params: unknown, env: Env, ctx: ExecutionContext) => Promise<any>> = {
  createTask: (p) => createTask(p),
  listTasks: () => listTasks(),
  runAnalysis: (p) => runAnalysis(p),
};


export async function dispatchRPC(method: string, params: unknown, env: Env, ctx: ExecutionContext) {
  if (!(method in rpcRegistry)) {
    throw new Error(`Unknown method: ${method}`);
  }

  const handler = rpcRegistry[method as keyof typeof rpcRegistry];
  return await handler(params, env, ctx);
}
