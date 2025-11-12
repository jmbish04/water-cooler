import { env } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import worker from './index';

describe('Multi-protocol Worker', () => {
  it('should return a health check on GET /', async () => {
    const res = await worker.fetch(new Request('http://localhost/'), env, {} as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('should return OpenAPI JSON on GET /openapi.json', async () => {
    const res = await worker.fetch(new Request('http://localhost/openapi.json'), env, {} as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openapi).toBe('3.1.0');
  });

  it('should handle REST API requests', async () => {
    const res = await worker.fetch(new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Task' }),
    }), env, {} as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.task.title).toBe('Test Task');
  });

  it('should handle RPC requests', async () => {
    const res = await worker.fetch(new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'createTask', params: { title: 'RPC Task' } }),
    }), env, {} as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.result.task.title).toBe('RPC Task');
  });

  it('should handle MCP requests', async () => {
    const res = await worker.fetch(new Request('http://localhost/mcp/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'createTask', params: { title: 'MCP Task' } }),
    }), env, {} as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.result.task.title).toBe('MCP Task');
  });

  it('should handle AI annotation requests', async () => {
    const aiResponse = {
      category: 'Technology',
      score: 95,
      summary: 'This is a test summary.',
    };
    env.AI = {
      run: vi.fn().mockResolvedValue({ response: JSON.stringify(aiResponse) }),
    };

    const res = await worker.fetch(new Request('http://localhost/ai/annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Title' }),
    }), env, {} as any);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(aiResponse);
  });
});
