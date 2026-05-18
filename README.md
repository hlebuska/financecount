# Fincount Backend

Fincount is a multi-service personal finance assistant that ingests bank statement files, extracts transaction data, enriches merchant context, categorizes spending, computes analytics, and answers user questions through an advisor agent.

This backend repository contains the API, worker agents, MCP server, data layer, and supporting services.

## What It Does

- Accepts uploaded financial files through the main API
- Parses PDF statements through a dedicated parser service
- Structures and normalizes raw transaction rows
- Detects duplicates before writing final transactions
- Enriches merchant context through an MCP tool backed by web search
- Categorizes transactions using memory, merchant enrichment, and LLM fallback
- Recomputes financial stats and signals asynchronously
- Serves an advisor agent that answers questions using SQL-backed tools and RAG knowledge retrieval

## System Components

- `apps/fincount`
  Main API. Handles file uploads, categories, transactions, review resolution, and analysis endpoints.
- `apps/ingestion-agent`
  Worker that processes uploaded files end-to-end.
- `apps/analyst-agent`
  Worker that recomputes stats and financial signals after ingestion changes.
- `apps/advisor-agent`
  Conversational finance assistant using LangChain tools plus RAG-backed knowledge retrieval.
- `apps/merchant-mcp`
  MCP server exposing merchant enrichment as a tool.
- `libs/db`
  Prisma-backed data access.
- `libs/rag`
  Embeddings and Qdrant integration.
- `libs/categorization-memory`
  Reuse layer for previous categorization patterns.
- `services/parser-service`
  FastAPI service that extracts text and tables from PDFs.

## High-Level Flow

1. A file is uploaded to the main API.
2. The API stores file metadata and queues an ingestion job in BullMQ.
3. `ingestion-agent` calls `parser-service` to extract PDF text.
4. The ingestion pipeline structures, normalizes, deduplicates, enriches, and categorizes each transaction.
5. Finalized transactions are written to Postgres.
6. The ingestion flow schedules analysis refresh work.
7. `analyst-agent` recomputes metrics and signals for week, month, and all-time periods.
8. `advisor-agent` answers questions from stored analytics, transactions, review items, and RAG knowledge.

## Tech Stack

- NestJS
- Prisma + PostgreSQL
- BullMQ + Redis
- Qdrant
- LangChain
- OpenAI API
- Model Context Protocol SDK
- FastAPI + pdfplumber

## Repository Structure

```text
fincount/
  apps/
    fincount/
    ingestion-agent/
    analyst-agent/
    advisor-agent/
    merchant-mcp/
  libs/
    db/
    rag/
    categorization-memory/
    common/
    contracts/
  prisma/
  services/parser-service/
  docker-compose.yml
```

## Local Ports

- `fincount` API: `3000`
- `ingestion-agent`: `3001`
- `analyst-agent`: `3002`
- `advisor-agent`: `3003`
- `merchant-mcp`: `3004`
- `parser-service`: `8001`
- `postgres`: `5432`
- `redis`: `6379`
- `qdrant`: `6333`

## Environment Variables

The repo currently reads these variables in code:

- `DATABASE_URL`
- `OPENAI_API_KEY` or `LLM_API_KEY`
- `CHAT_MODEL`
- `REDIS_HOST`
- `REDIS_PORT`
- `MERCHANT_MCP_URL`
- `API_PORT`
- `INGESTION_AGENT_PORT`
- `ANALYST_AGENT_PORT`
- `ADVISOR_AGENT_PORT`
- `MCP_SERVER_PORT`

Typical local value:

```env
MERCHANT_MCP_URL=http://localhost:3004
```

## Setup

### 1. Install backend dependencies

```bash
npm install
```

### 2. Start infrastructure

```bash
docker compose up -d postgres redis qdrant
```

### 3. Prepare the database

```bash
npx prisma migrate deploy
```

If you are working from a clean local environment and want development migrations instead:

```bash
npx prisma migrate dev
```

### 4. Start the parser service

```bash
python -m venv .venv

# macOS/Linux
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1

pip install -r services/parser-service/requirements.txt

uvicorn main:app --app-dir services/parser-service --reload --host 0.0.0.0 --port 8001
```

### 5. Seed or prepare Qdrant if needed

```bash
npm run qdrant:setup
```

### 6. Start the Nest apps

Run each command in a separate terminal from the repo root.

```bash
npx nest start fincount --watch
npx nest start ingestion-agent --watch
npx nest start analyst-agent --watch
npx nest start advisor-agent --watch
npx nest start merchant-mcp --watch
```

If you need stdio MCP transport instead of HTTP:

```bash
MCP_TRANSPORT=stdio npx nest start merchant-mcp --watch
```

## Running Tests

```bash
npm run test
npm run test:e2e
npm run test:cov
```

Scenario-based test coverage for capstone review is documented in `TEST_SCENARIOS.md`.

## Main Endpoints

### Main API

- `POST /ingestion-files/upload`
- `GET /ingestion-files`
- `GET /transactions`
- `GET /categories`
- `GET /analysis/stats`
- `GET /analysis/signals`

### Advisor Agent

- `GET /conversations`
- `GET /conversations/:id/messages`
- `POST /advisor/query`

### Parser Service

- `POST /parse`

## Current Architecture Notes

- Merchant enrichment is implemented as an MCP tool consumed by the ingestion agent over HTTP.
- The advisor agent uses SQL-backed retrieval tools for user facts and Qdrant for general finance knowledge retrieval.
- Analysis recomputation is asynchronous and debounced through BullMQ.
- The current API and advisor flow use a hardcoded demo user in several places. This is acceptable for a local capstone demo, but it is not production-ready multi-user auth.

## Known Limitations

- No authentication or tenant isolation yet; several endpoints use `demo-user`.
- Observability is currently lightweight and mostly based on Nest `Logger` output rather than full tracing.
- The quality of categorization and merchant enrichment depends on upstream model responses and available web evidence.
- The parser service is focused on PDF extraction and may need extension for more file types.

## Useful Files

- `APPS_START_COMMANDS.md`
- `docker-compose.yml`
- `prisma/schema.prisma`
- `apps/ingestion-agent/src/file-ingestion.processor.ts`
- `apps/analyst-agent/src/analyst-agent.service.ts`
- `apps/advisor-agent/src/advisor-agent.service.ts`
- `apps/merchant-mcp/src/merchant-mcp-server.service.ts`

## Frontend

The React client lives in the sibling directory `../fincount-frontend` and talks to this backend over HTTP.
