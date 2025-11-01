/**
 * Dynamic OpenAPI Specification Generator
 *
 * Purpose:
 * - Generate OpenAPI 3.1 spec from route definitions
 * - Serve as JSON and YAML
 * - Enable API documentation and client generation
 *
 * AI Agent Hints:
 * - Dynamically generates spec based on Zod schemas
 * - Includes all API routes with request/response schemas
 * - Accessible at /openapi.json and /openapi.yaml
 */

import { Hono } from 'hono';
import { Env } from '../types/env';

const openapi = new Hono<{ Bindings: Env }>();

/**
 * GET /openapi.json
 * Return OpenAPI spec as JSON
 */
openapi.get('/openapi.json', (c) => {
  const spec = generateOpenAPISpec(c.req.url);
  return c.json(spec);
});

/**
 * GET /openapi.yaml
 * Return OpenAPI spec as YAML
 */
openapi.get('/openapi.yaml', (c) => {
  const spec = generateOpenAPISpec(c.req.url);
  const yaml = jsonToYaml(spec);
  return c.text(yaml, 200, { 'Content-Type': 'application/yaml' });
});

/**
 * Generate OpenAPI 3.1 specification
 */
function generateOpenAPISpec(baseUrl: string): any {
  const url = new URL(baseUrl);
  const serverUrl = `${url.protocol}//${url.host}`;

  return {
    openapi: '3.1.0',
    info: {
      title: 'AI-Curated Discovery Hub API',
      version: '1.0.0',
      description: 'Modular Cloudflare Worker for AI-powered content curation from GitHub, App Store, Reddit, and Discord',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: serverUrl,
        description: 'Cloudflare Worker',
      },
    ],
    paths: {
      '/api/items': {
        get: {
          summary: 'List curated items',
          operationId: 'getItems',
          tags: ['Items'],
          parameters: [
            { name: 'source', in: 'query', schema: { type: 'string', enum: ['github', 'appstore', 'reddit', 'discord'] } },
            { name: 'unread', in: 'query', schema: { type: 'boolean' } },
            { name: 'starred', in: 'query', schema: { type: 'boolean' } },
            { name: 'minScore', in: 'query', schema: { type: 'number' } },
            { name: 'limit', in: 'query', schema: { type: 'number', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'number', default: 0 } },
          ],
          responses: {
            200: {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchResult' },
                },
              },
            },
          },
        },
      },
      '/api/search': {
        get: {
          summary: 'Semantic search',
          operationId: 'search',
          tags: ['Search'],
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'source', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'number', default: 20 } },
          ],
          responses: {
            200: {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchResult' },
                },
              },
            },
          },
        },
      },
      '/api/items/{id}/ask': {
        post: {
          summary: 'Ask AI about an item',
          operationId: 'askQuestion',
          tags: ['AI'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    question: { type: 'string', minLength: 1 },
                    includeRelated: { type: 'boolean', default: false },
                  },
                  required: ['question'],
                },
              },
            },
          },
          responses: {
            200: {
              description: 'AI response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/QAResponse' },
                },
              },
            },
          },
        },
      },
      '/api/star/{id}': {
        post: {
          summary: 'Star/unstar item',
          operationId: 'starItem',
          tags: ['Actions'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    starred: { type: 'boolean' },
                  },
                  required: ['starred'],
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ActionResponse' },
                },
              },
            },
          },
        },
      },
      '/api/scan': {
        post: {
          summary: 'Trigger manual scan',
          operationId: 'triggerScan',
          tags: ['Admin'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sourceId: { type: 'number' },
                    force: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Scan triggered',
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Item: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sourceId: { type: 'number' },
            title: { type: 'string' },
            url: { type: 'string' },
            summary: { type: 'string', nullable: true },
            tags: { type: 'array', items: { type: 'string' }, nullable: true },
            reason: { type: 'string', nullable: true },
            score: { type: 'number', minimum: 0, maximum: 1 },
            metadata: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        SearchResult: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/Item' } },
            total: { type: 'number' },
            offset: { type: 'number' },
            limit: { type: 'number' },
          },
        },
        QAResponse: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            citations: { type: 'array', items: { type: 'string' } },
            relatedItems: { type: 'array', items: { $ref: '#/components/schemas/Item' } },
            model: { type: 'string' },
          },
        },
        ActionResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            action: { type: 'string' },
            itemId: { type: 'string' },
          },
        },
      },
    },
  };
}

/**
 * Convert JSON to YAML (simple implementation)
 */
function jsonToYaml(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      yaml += `${spaces}${key}: null\n`;
    } else if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      value.forEach((item) => {
        if (typeof item === 'object') {
          yaml += `${spaces}- \n${jsonToYaml(item, indent + 2)}`;
        } else {
          yaml += `${spaces}- ${item}\n`;
        }
      });
    } else if (typeof value === 'object') {
      yaml += `${spaces}${key}:\n${jsonToYaml(value, indent + 1)}`;
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }

  return yaml;
}

export default openapi;
