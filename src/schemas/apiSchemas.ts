import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Augment the Zod object with the .openapi() method
extendZodWithOpenApi(z);

export const Task = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  status: z.enum(["pending", "running", "done"]).default("pending"),
  createdAt: z.string().datetime(),
});

export const CreateTaskRequest = z.object({
  title: z.string().min(1),
});

export const CreateTaskResponse = z.object({
  success: z.literal(true),
  task: Task,
});

export const ListTasksResponse = z.object({
  success: z.literal(true),
  tasks: z.array(Task),
});

export const AnalysisRequest = z.object({
  taskId: z.string().uuid(),
  depth: z.number().int().min(1).max(5).default(1),
});

export const AnalysisResponse = z.object({
  success: z.literal(true),
  report: z.object({
    taskId: z.string().uuid(),
    score: z.number(),
    notes: z.string(),
  }),
});

export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.any().optional(),
});
