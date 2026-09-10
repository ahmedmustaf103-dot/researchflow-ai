# ResearchFlow AI

AI-powered Business & Market Research Analyst.

ResearchFlow takes a research question, breaks it into subtasks, gathers evidence, and produces a citation-backed report. The intended workflow is:

**Question → Plan → Search → Retrieve → Extract → Verify → Analyse → Report**

This repository is a public portfolio project. It is being built in phases.

## Current status: Phase 2A

Phase 2A replaces the mocked **Plan** stage with Gemini structured planning.

You can:

- Sign in with Google (when OAuth is configured)
- Submit a research question
- Watch a project move through the research stages
- Inspect Gemini-generated research tasks
- Inspect sources, findings, and a generated report from the remaining mocked stages

This is not a fully autonomous research agent.

### Phase 2A

- Gemini structured planning is implemented
- Search remains mocked
- Retrieval remains mocked
- Extraction remains mocked
- Analysis remains mocked
- Report generation remains mocked
- RAG is not implemented
- MCP servers are not implemented

### Not implemented yet

These belong to later phases:

- Real web search
- Real page retrieval
- Real extraction, verification, analysis, and report generation
- Embeddings, vector search, or RAG
- MCP servers
- Production-quality citation-backed reports

## Setup

1. Copy `.env.example` to `.env.local` and set `AUTH_SECRET` (`openssl rand -base64 32`).
2. Start Postgres: `docker compose up -d`
3. Generate the Prisma client and apply migrations: `npx prisma generate && npx prisma migrate deploy`
4. Run the app: `npm run dev`

Google sign-in needs `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The app boots without them; sign-in stays disabled until those values are set.

Gemini planning needs `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-2.5-flash`. The app boots without an API key; the planning stage fails with a clear error instead of inventing a fake plan.

## Scripts

- `npm run dev` — development server
- `npm run typecheck` — TypeScript
- `npm run lint` — ESLint
- `npm test` — Vitest
- `LIVE_API_TESTS=1 npx vitest run --config vitest.live.config.mts` — optional live Gemini planning test
- `npm run build` — production build
