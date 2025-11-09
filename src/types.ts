export interface Env {
  ROOM_DO: DurableObjectNamespace;
}

export type RPCMethod = "createTask" | "listTasks" | "runAnalysis";
