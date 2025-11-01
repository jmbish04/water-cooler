# AI-Curated Discovery Hub

**Modular Cloudflare Worker with Actors, Vectorize, D1, and Mantine UI**

A fully-featured content curation platform that discovers, summarizes, vectorizes, and curates new items from GitHub, App Store (iTunes Search API), Reddit, and Discord using Cloudflare's edge infrastructure and AI capabilities.

---

## Architecture

### Core Components

- **Backend**: Cloudflare Workers with Hono framework
- **Actors**: Durable Objects for stateful operations
- **Database**: D1 (SQLite) for relational data
- **Cache**: KV for API response caching
- **Storage**: R2 for assets
- **Search**: Vectorize for semantic search
- **AI**: Workers AI for curation, tagging, and Q&A
- **Email**: Email Routing for daily digests
- **Queue**: Queues for async scan processing
- **Frontend**: React + Mantine (static build in /public)

### Key Features

✅ **Multi-source Discovery**: GitHub repos, App Store apps, Reddit posts, Discord messages
✅ **AI Curation**: Automatic summarization, tagging, scoring, and reasoning
✅ **Semantic Search**: Vector embeddings with Vectorize
✅ **Q&A**: Ask AI questions about any curated item
✅ **User Actions**: Star, follow-up, mark as read
✅ **Email Digests**: Daily top items via Cloudflare Email
✅ **Audit Logs**: Comprehensive logging to D1 for observability
✅ **OpenAPI**: Dynamic spec generation at `/openapi.json` and `/openapi.yaml`
✅ **Static Frontend**: React + Mantine compiled to /public

---

## Project Structure

```
curation-hub/
├── wrangler.jsonc              # Cloudflare Workers config
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config
├── schema.sql                  # Complete D1 schema
├── migrations/                 # Incremental migrations
│   ├── 0001_init.sql
│   ├── 0002_add_vectors.sql
│   ├── 0003_audit_logging.sql
│   └── 0004_user_preferences.sql
├── src/
│   ├── index.ts                # Main Hono app + exports
│   ├── router/
│   │   ├── api.ts              # REST API routes
│   │   ├── openapi.ts          # OpenAPI spec generator
│   │   └── middleware.ts       # CORS, logging, validation
│   ├── actors/                 # Durable Objects
│   │   ├── SchedulerActor.ts   # Periodic scan orchestration
│   │   ├── CuratorActor.ts     # AI curation processor
│   │   ├── GitHubActor.ts      # GitHub source scanner
│   │   ├── AppStoreActor.ts    # App Store scanner
│   │   ├── RedditActor.ts      # Reddit scanner
│   │   ├── DiscordActor.ts     # Discord scanner
│   │   └── UserSessionActor.ts # Per-user state management
│   ├── services/
│   │   ├── db.ts               # D1 CRUD operations
│   │   ├── curator.ts          # AI + Vectorize helpers
│   │   ├── github.ts           # GitHub API client
│   │   ├── appstore.ts         # iTunes Search API
│   │   ├── reddit.ts           # Reddit JSON API
│   │   ├── discord.ts          # Discord API (requires bot token)
│   │   └── digest.ts           # Email digest renderer
│   ├── types/
│   │   ├── domain.ts           # Core business types
│   │   ├── api.ts              # Zod schemas + TS types
│   │   └── env.ts              # Cloudflare bindings types
│   ├── utils/
│   │   ├── logger.ts           # Audit log writer
│   │   ├── response.ts         # JSON response helpers
│   │   └── hash.ts             # SHA-256 hashing
│   └── workflows/
│       ├── scheduleScan.ts     # 6h recurring scan workflow
│       └── dailyDigest.ts      # 9am daily email workflow
├── ui/                         # React source (builds to /public)
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── app.tsx
│       ├── components/
│       │   ├── ItemCard.tsx
│       │   ├── SearchBar.tsx
│       │   └── QAModal.tsx
│       ├── pages/
│       │   ├── Discover.tsx
│       │   ├── Starred.tsx
│       │   ├── ReadingList.tsx
│       │   └── Settings.tsx
│       └── lib/
│           └── api.ts          # API client
└── public/                     # Static build output (served by Worker)
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI (`npm i -g wrangler`)

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Cloudflare Resources

```bash
# D1 Database
npm run db:create

# KV Namespace
npm run kv:create

# R2 Bucket
npm run r2:create

# Vectorize Index
npm run vectorize:create

# Queue
npm run queue:create
```

### 3. Update `wrangler.jsonc`

Replace placeholder IDs with actual values from step 2.

### 4. Run Migrations

```bash
npm run db:migrate
```

### 5. Build Frontend

```bash
npm run build:frontend
```

### 6. Deploy

```bash
npm run deploy
```

### 7. (Optional) Local Development

```bash
# Terminal 1: Start Worker dev server
npm run dev

# Terminal 2: Start UI dev server
npm run dev:ui
```

---

## API Endpoints

### Items

- `GET /api/items?source=&unread=&starred=&minScore=&limit=&offset=`
- `GET /api/search?q=&source=&tags=&minScore=&limit=`
- `POST /api/items/:id/ask` - Ask AI about an item

### Actions

- `POST /api/star/:id` - Star/unstar item
- `POST /api/followup/:id` - Add/remove from reading list
- `POST /api/mark-read/:id` - Mark as read

### Configuration

- `GET /api/sources` - List all sources
- `POST /api/config` - Update source configuration
- `POST /api/scan` - Trigger manual scan

### Documentation

- `GET /openapi.json` - OpenAPI 3.1 spec (JSON)
- `GET /openapi.yaml` - OpenAPI 3.1 spec (YAML)

---

## License

MIT