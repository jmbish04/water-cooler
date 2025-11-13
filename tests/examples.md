# Multi-Protocol Worker API Examples

This document provides examples of how to interact with the various API surfaces of the multi-protocol worker.

## REST API

The REST API is the recommended interface for traditional web clients.

### Create a Task

```bash
curl -X POST http://127.0.0.1:8787/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "My first task"}'
```

### List Tasks

```bash
curl http://127.0.0.1:8787/api/tasks
```

### Run Analysis

```bash
curl -X POST http://127.0.0.1:8787/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"taskId": "a-valid-uuid", "depth": 3}'
```

## WebSocket API

The WebSocket API is ideal for real-time, bidirectional communication.

### Browser Example

```javascript
const ws = new WebSocket("ws://127.0.0.1:8787/ws?projectId=my-project");

ws.onopen = () => {
  console.log("WebSocket connection established");
  ws.send(JSON.stringify({ type: "join", payload: { a: 1 } }));
};

ws.onmessage = (event) => {
  console.log("Received message:", event.data);
};

ws.onclose = () => {
  console.log("WebSocket connection closed");
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};
```

## RPC API

The RPC API allows for direct method calls, which is useful for server-to-server communication or for clients that prefer an RPC-style interaction.

### Example with curl

```bash
curl -X POST http://127.0.0.1:8787/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "createTask", "params": {"title": "A task created via RPC"}}'
```

### Example from another Worker

```typescript
// In a separate Cloudflare Worker with a service binding to this one (e.g., as "CORE"):
async function callCreateTask(env) {
  const response = await env.CORE.fetch("http://core-worker/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "createTask",
      params: { title: "A task created from another worker" },
    }),
  });
  return response.json();
}
```

## Model Context Protocol (MCP)

The MCP endpoints are designed for AI models and other automated systems.

### List Tools

```bash
curl http://127.0.0.1:8787/mcp/tools
```

### Execute a Tool

```bash
curl -X POST http://127.0.0.1:8787/mcp/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "runAnalysis", "params": {"taskId": "a-valid-uuid", "depth": 2}}'
```
