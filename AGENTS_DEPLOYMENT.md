# Cloudflare Agents Deployment Guide

## Overview

This project uses **Cloudflare Agents SDK** for asynchronous content enrichment. The enrichment agent processes new content entries, generates AI metadata, and stores normalized badges.

## Agent: Content Enrichment (`src/agents/enrich.ts`)

### Purpose
- Process new content entries asynchronously
- Call Cloudflare Workers AI (`@cf/openai/gpt-oss-120b`) for metadata generation
- Generate: summary, tags (normalized to badges), score (0-100), follow-up questions
- Store results in D1 with proper badge relationships

### Deployment

#### 1. Install Dependencies
```bash
npm install @cloudflare/agents
```

#### 2. Deploy the Agent
```bash
# Deploy the enrichment agent
npx wrangler deploy src/agents/enrich.ts --name water-cooler-enrich-agent
```

#### 3. Configure Bindings
The agent requires the following bindings (configured via CLI or dashboard):
- `DB` - D1 database binding
- `AI` - Cloudflare Workers AI binding

Example deployment with bindings:
```bash
npx wrangler deploy src/agents/enrich.ts \
  --name water-cooler-enrich-agent \
  --d1 DB=water-cooler \
  --ai AI
```

### Usage

#### Invoking the Agent
From your Worker or another agent:

```typescript
// Invoke the enrichment agent
const response = await env.ENRICH_AGENT.run({
  entryId: item.id,
  title: item.title,
  url: item.url,
  content: itemContent,
  source: 'github' // or 'reddit', 'appstore', 'discord'
});

console.log('Enrichment result:', response);
```

#### Agent Input Schema
```typescript
{
  entryId: string;    // SHA-256 hash of item
  title: string;      // Item title
  url: string;        // Item URL
  content: string;    // Full content for AI analysis
  source: string;     // Source type (github, reddit, etc.)
}
```

#### Agent Output Schema
```typescript
{
  success: boolean;
  entryId: string;
  metadata: {
    summary: string;
    score: number;        // 0-100
    badgeCount: number;
    questionCount: number;
  }
}
```

## Integration with Existing Flow

### Current Flow (CuratorActor)
The existing `CuratorActor` Durable Object already implements badge normalization and AI question generation. It can be used as-is.

### Agent-Based Flow (Optional Enhancement)
For long-running or queue-based enrichment, you can:

1. **Queue-Based Processing**
   ```typescript
   // In SchedulerActor or scan completion
   await env.SCAN_QUEUE.send({
     type: 'enrich',
     entryId: item.id,
     title: item.title,
     url: item.url,
     content: itemContent,
     source: item.source
   });
   ```

2. **Queue Consumer**
   ```typescript
   // In src/index.ts queue handler
   async queue(batch: MessageBatch, env: Env): Promise<void> {
     for (const message of batch.messages) {
       if (message.body.type === 'enrich') {
         await env.ENRICH_AGENT.run(message.body);
       }
     }
   }
   ```

## Benefits of Agents

- **Async Processing**: Long-running enrichment doesn't block request handlers
- **Retry Logic**: Built-in retry and error handling
- **Observability**: Automatic logging and tracing
- **Scalability**: Agents scale independently of your main Worker

## Monitoring

View agent execution logs:
```bash
npx wrangler tail water-cooler-enrich-agent
```

## Troubleshooting

### Agent Not Found
- Ensure the agent is deployed: `npx wrangler deployments list`
- Check binding configuration in wrangler.toml

### Database Errors
- Verify D1 binding is configured correctly
- Run migrations: `npx wrangler d1 execute water-cooler --file=migrations/0003_add_badges_and_questions.sql`

### AI Model Errors
- Ensure `@cf/openai/gpt-oss-120b` is available in your account
- Check AI binding configuration

## Next Steps

1. Deploy the enrichment agent
2. Test with a sample item
3. Monitor logs for successful enrichment
4. (Optional) Integrate with queue-based processing for scale
