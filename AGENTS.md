Project Architecture & Agent Overview

This document provides a complete overview of the "water-cooler" application, its architecture, and the various "agents" (Durable Objects and Cloudflare Agents SDK) that power it.

The system is a Hono-based Cloudflare Worker that uses multiple Durable Objects (Actors) to manage stateful operations like scanning, curation, and user sessions.

Core Components & Bindings

The application is orchestrated by the main Worker (src/index.ts) and relies on the following bindings defined in wrangler.jsonc:

DB (D1): The primary SQL database for storing all items, sources, user actions, logs, and metadata.

CACHE (KV): Used for caching API responses from external sources (GitHub, Reddit, etc.) to avoid rate-limiting.

R2 (R2 Bucket): Bound as water-cooler-assets for potential future asset storage.

SCAN_QUEUE (Queue): A message queue to decouple scan scheduling from scan execution.

AI (Workers AI): Used for generating summaries, tags, questions, and embeddings.

VEC (Vectorize): The vector database for storing embeddings and enabling semantic search.

ASSETS (Fetcher): Binds to the static React frontend built from the /ui directory.

MAILER (Email): Used for sending daily email digests.

Durable Objects (Actors): A suite of stateful actors for specific tasks (detailed below).

Secrets: GITHUB_TOKEN, DISCORD_BOT_TOKEN, REDDIT_CLIENT_ID, etc., for accessing external APIs.

System Data Flow

The application has two primary flows: data ingestion (scanning) and data consumption (API/UI).

Data Ingestion (Scanning & Curation):

A cron trigger (0 */6 * * *) fires the SchedulerActor.

SchedulerActor queries D1 for all enabled sources.

It sends a message to SCAN_QUEUE for each source.

The queue consumer in src/index.ts receives these messages.

The consumer routes the message to the correct Source Actor (GitHubActor, RedditActor, etc.) based on the source type.

The Source Actor (e.g., GitHubActor) fetches data from the external API (using CACHE to avoid redundant calls) and manages its internal state (like processed URLs) in Durable Object storage.

For each new item found, the Source Actor calls the CuratorActor.

The CuratorActor performs the AI enrichment:

Calls Workers AI to get a summary, tags, and AI-generated questions (src/services/curator.ts).

Calls Workers AI (embedding model) to generate a vector.

Inserts the vector into the Vectorize (VEC) binding.

Normalizes the AI-generated tags into badges (src/services/badges.ts).

Writes the final, enriched item to the D1 Database (DB).

Data Consumption (API & UI):

A user opens the React app, which is served from the ASSETS binding.

The app makes calls to the Hono API (src/router/api.ts).

Reading data (e.g., GET /api/items): The API queries D1 directly (src/services/db.ts).

User actions (e.g., POST /api/star/:id): The API calls the UserSessionActor for that specific user.

The UserSessionActor records the action (star, read, etc.) in D1 and caches the state for that user.

Durable Objects (Actors)

This project relies on Durable Objects to act as stateful actors. All actors are exported from src/index.ts and defined in src/actors/.

1. SchedulerActor

Source: src/actors/SchedulerActor.ts

Purpose: The central "cron job" manager. It's a singleton DO (bound to the name "scheduler") that runs on an alarm (every 6 hours) to kick off the scanning process for all active sources by enqueuing them in SCAN_QUEUE.

WebSocket: It also hosts a WebSocket server (/scheduler) to stream real-time scan logs to the UI's "Scan Log Viewer".

2. Source Actors

These actors are responsible for fetching data from a single type of source.

GitHubActor: (src/actors/GitHubActor.ts) Fetches repo data from GitHub.

AppStoreActor: (src/actors/AppStoreActor.ts) Fetches app data from the iTunes Search API.

RedditActor: (src/actors/RedditActor.ts) Fetches posts from subreddits.

DiscordActor: (src/actors/DiscordActor.ts) Fetches messages from Discord channels.

IgduxActor: (src/actors/IgduxActor.ts) Fetches and translates posts from the Igdux JSON feed.

3. CuratorActor

Source: src/actors/CuratorActor.ts

Purpose: A transient actor responsible for the complete AI enrichment pipeline for a single item. It is called by the Source Actors.

Flow:

Receives item data (title, URL, content).

Calls curateContent service to get AI summary, tags, score, and questions.

Calls generateEmbedding service and inserts the result into VEC.

Calls normalizeBadges service to get badge IDs.

Calls createItem to save the enriched item to D1.

Calls linkBadgesToItem to link the item and its badges in D1.

4. UserSessionActor

Source: src/actors/UserSessionActor.ts

Purpose: Manages the state for a single user (e.g., user-xyz). It's responsible for handling user-specific writes, like starring an item or marking it as read.

Flow:

Receives an action (e.g., "star") and an itemId from the API.

Writes the action to the user_actions table in D1.

Caches the user's actions (e.g., a Set of starred item IDs) in its own DO storage for fast retrieval (this part is partially implemented).

Cloudflare Agent (SDK)

The repository also includes an agent built with the Cloudflare Agents SDK (using the agents package).

1. Content Enrichment Agent

Source File: src/agents/enrich.ts

Purpose: This agent provides an alternative, asynchronous way to handle content enrichment. It performs a similar role to the CuratorActor but is designed to be invoked as a standalone agent.

SDK: Cloudflare Agents SDK (package: agents)

Status: This agent is defined in the repo but is not currently called by the main application flow, which uses the CuratorActor (Durable Object) instead. It serves as a blueprint for how this logic could be migrated to the Agents SDK.

Agent Input Schema

interface EnrichmentInput {
  entryId: string;    // Item ID (SHA-256 hash)
  title: string;      // Item title
  url: string;        // Item URL
  content: string;    // Full content for analysis
  source: string;     // Source type (github, reddit, etc.)
}


Agent Output Schema

{
  success: boolean,
  entryId: string,
  metadata: {
    summary: string,
    score: number,        // 0-100
    badgeCount: number,
    questionCount: number
  }
}


Deployment

This agent can be deployed as a standalone worker. See AGENTS_DEPLOYMENT.md for detailed instructions.

# Example deployment command (update name as needed)
npx wrangler deploy src/agents/enrich.ts \
  --name water-cooler-enrich-agent \
  --d1 DB=water-cooler \
  --ai AI

