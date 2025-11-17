import { rpcRegistry } from './rpc';
import type { Env as CoreEnv } from './types/env';

export type Env = CoreEnv;

export type RPCMethod = keyof typeof rpcRegistry;
