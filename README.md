# ResearchFlow AI

AI-powered Business & Market Research Analyst.

ResearchFlow takes a research question, breaks it into subtasks, gathers evidence, and produces a citation-backed report. The intended workflow is:

**Question → Plan → Search → Retrieve → Extract → Verify → Analyse → Report**

This repository is a public portfolio project. It is being built in phases.

## Current status: Phase 1

Phase 1 is a working **mocked** research workflow.

You can:

- Sign in with Google (when OAuth is configured)
- Submit a research question
- Watch a project move through the research stages
- Inspect tasks, sources, findings, and a generated report
- Ask follow-up storage is prepared, but follow-up Q&A is not implemented yet

The pipeline, search, page retrieval, extraction, verification, and report are **deterministic mocks**. They exist to prove the architecture, not to produce real market research.

### Not implemented yet

These belong to later phases:

- Real LLM calls (Gemini or otherwise)
- Real web search
- Real page retrieval
- Embeddings, vector search, or RAG
- MCP servers
- Source verification and conflict detection
- Production-quality citation-backed reports

## Setup

1. Copy `.env.example` to `.env.local` and set `AUTH_SECRET` (`openssl rand -base64 32`).
2. Start Postgres: `docker compose up -d`
3. Generate the Prisma client and apply migrations: `npx prisma generate && npx prisma migrate deploy`
4. Run the app: `npm run dev`

Google sign-in needs `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The app boots without them; sign-in stays disabled until those values are set.

## Scripts

- `npm run dev` — development server
- `npm run typecheck` — TypeScript
- `npm run lint` — ESLint
- `npm test` — Vitest
- `npm run build` — production build
