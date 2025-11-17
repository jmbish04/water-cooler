import { rpcRegistry } from './rpc';

export interface Env {
  ROOM_DO: DurableObjectNamespace;
  AI: any; // Add the AI binding
}

export type RPCMethod = keyof typeof rpcRegistry;
