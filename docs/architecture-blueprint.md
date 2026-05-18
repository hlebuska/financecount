
# Architecture Blueprint

## 1. System Overview

Fincount is a multi-service personal finance assistant that ingests bank statement files, extracts and normalizes transactions, enriches merchant context, computes financial analytics, and answers user questions through a conversational advisor.

The architecture is designed to:

- separate operational concerns across specialized services
- handle ingestion and analysis asynchronously
- preserve traceability from uploaded files to finalized transactions
- ground user-facing answers in stored financial data and retrieved finance knowledge
- keep merchant enrichment modular through MCP

A React frontend provides file upload, transactions, categories, insights, and advisor chat experiences on top of the backend services.

## 2. High-Level Architecture

```text
User
  |
  v
Frontend (React 19 + Vite)
  |
  +------------------------------+
  |                              |
  v                              v
Main API (NestJS, :3000)     Advisor Agent (NestJS, :3003)
  |                              |
  |                              +--> PostgreSQL
  |                              +--> Qdrant: finance_knowledge
  |                              +--> BullMQ: conversation-summary
  |
  +--> PostgreSQL
  +--> BullMQ: file-ingestion
  |
  v
Ingestion Agent (NestJS, :3001)
  |
  +--> Parser Service (FastAPI + pdfplumber, :8001)
  +--> Merchant MCP Server (NestJS MCP, :3004)
  +--> PostgreSQL
  +--> BullMQ: analysis-refresh
  |
  v
Analyst Agent (NestJS, :3002)
  |
  +--> PostgreSQL

```

Shared Infrastructure (Docker Compose):
- Redis
- PostgreSQL
- Qdrant


## 3. Agent Architecture

### 3.1 Ingestion Agent

The Ingestion Agent is responsible for turning uploaded financial documents into clean, structured transaction records.

Responsibilities:

* parse PDFs through the parser service
* extract transactions from parsed text
* normalize amount, currency, direction, date, and merchant candidate
* detect duplicates using exact and fuzzy fingerprints
* enrich merchants through the MCP server
* categorize transactions using categorization memory, merchant enrichment, and LLM fallback
* create review items for low-confidence or uncategorized transactions
* track file progress and ingestion issues

Implementation notes:

* orchestrated by `file-ingestion` BullMQ jobs
* persists both raw extracted rows and finalized transactions
* schedules downstream analysis refresh after ingestion completes

### 3.2 Analyst Agent

The Analyst Agent is responsible for deterministic financial analytics.

Responsibilities:

* compute spending statistics
* aggregate spending by period and category
* detect trends and month-to-month changes
* generate analysis signals
* recompute analytics for week, month, and all-time windows

Implementation notes:

* processes `analysis-refresh` BullMQ jobs
* writes `FinancialStat` and `AnalysisSignal`
* computes signals such as category increases, category decreases, top category changes, and high uncategorized share

### 3.3 Advisor Agent

The Advisor Agent is responsible for the conversational finance assistant.

Responsibilities:

* answer user questions in natural language
* retrieve user-specific facts from PostgreSQL
* retrieve general finance knowledge from Qdrant
* provide grounded financial guidance
* maintain conversation history

Implementation notes:

* built with LangChain agent tooling
* queries PostgreSQL for transactions, stats, signals, and review items
* queries Qdrant for finance knowledge retrieval
* persists conversations and messages
* summarizes long conversations asynchronously through a queue worker

### 3.4 Merchant MCP Server

The Merchant MCP Server isolates merchant enrichment as a reusable tool.

Responsibilities:

* normalize messy merchant names
* infer business type
* suggest likely transaction category
* provide confidence and ambiguity flags
* cache enrichment results
* perform web-assisted lookup when needed

Implementation notes:

* exposes `enrich_merchant` through MCP
* uses OpenAI web search for merchant inference
* caches results in Redis or in-memory mode
* keeps merchant research separate from ingestion orchestration

### 3.5 Parser Service

The Parser Service extracts text and tables from uploaded PDF statements.

Responsibilities:

* extract PDF text
* extract table-like transaction data
* return parsed content to the ingestion agent

Implementation notes:

* implemented as a small FastAPI service
* uses `pdfplumber`
* runs separately from the NestJS services

## 4. Data Flow

1. User uploads a PDF from the frontend.
2. Main API stores file metadata.
3. Main API computes a SHA-256 hash for deduplication. (made optional for file upload fails)
4. Main API moves the file into persistent upload storage.
5. Main API creates a BullMQ ingestion job.
6. Ingestion Agent receives the job.
7. Ingestion Agent updates file processing stage and progress.
8. Ingestion Agent calls the Parser Service.
9. Parser Service extracts PDF text and table content.
10. Parser output is sent to an LLM-based structuring step.
11. Raw transaction rows are extracted.
12. Each row is normalized into canonical transaction fields.
13. Duplicate detection runs using exact and fuzzy fingerprints.
14. Merchant MCP enrichment is requested for eligible transactions.
15. Categorization is attempted using:
    * categorization memory in Qdrant
    * merchant enrichment result
    * direct LLM fallback
16. Final transactions are saved in PostgreSQL.
17. Low-confidence categorization creates review items and ingestion issues.
18. Ingestion Agent finalizes file-level counters and status.
19. Analysis refresh work is scheduled asynchronously.
20. Analyst Agent recomputes analytics and signals.
21. Advisor Agent answers user questions using stored transactions, analytics, review items, and RAG knowledge.

## 5. Technology Stack

| Layer                | Technology           |
| -------------------- | -------------------- |
| Frontend             | React 19 + Vite      |
| Main API             | NestJS               |
| Ingestion Worker     | NestJS + BullMQ      |
| Analyst Worker       | NestJS + BullMQ      |
| Advisor Service      | NestJS + LangChain   |
| Merchant Tool Server | NestJS + MCP SDK     |
| Parser Service       | FastAPI + pdfplumber |
| Queue                | BullMQ               |
| Cache / Broker       | Redis                |
| Database             | PostgreSQL           |
| ORM                  | Prisma               |
| Vector Database      | Qdrant               |
| AI Provider          | OpenAI               |
| MCP                  | Custom MCP server    |

## 6. RAG Architecture

The advisor service uses retrieval-augmented generation to provide grounded finance guidance.

User-specific facts come from PostgreSQL tools. General finance knowledge comes from Qdrant retrieval.

### Knowledge Chunking

* The system expects a `finance_knowledge` collection in Qdrant.
* The repository sets up the collection.
* A full in-repo document ingestion and chunking pipeline is not yet implemented.
* Chunk preparation is currently external or manual.

### Embeddings

* Queries are embedded with OpenAI `text-embedding-3-small`.
* The same embedding infrastructure is reused for categorization memory.

### Vector Search

* Advisor knowledge queries are embedded.
* Embedded queries are searched against Qdrant.
* The retrieval service returns top matches with payload data such as title, source, and text.

### Retrieval

The advisor agent exposes a dedicated finance knowledge tool.

That tool is intended for:

* budgeting explanations
* general financial concepts
* finance-related guidance
* contextual framing

It is not used as the source of truth for user-specific totals.

### Grounding Responses

* User-specific facts come from PostgreSQL.
* General finance concepts come from Qdrant.
* The advisor prompt instructs the model not to invent user facts.
* The advisor should prefer SQL-backed retrieval for user-specific financial evidence.

### Additional Vector Usage

Qdrant also stores a `categorization_memory` collection.

This collection supports semantic reuse of previously resolved categorization decisions, especially after manual review.

## 7. MCP Integration

MCP was used to isolate merchant enrichment into a reusable tool boundary.

This keeps ingestion orchestration separate from merchant research logic and makes enrichment easier to reuse, replace, or expose through different transports.

### Merchant Enrichment Flow

1. Ingestion Agent extracts a merchant candidate and optional description.
2. Ingestion Agent connects to the Merchant MCP Server over HTTP.
3. Ingestion Agent calls the `enrich_merchant` tool.
4. Merchant MCP checks cache first.
5. If there is no cache hit, Merchant MCP performs OpenAI-backed web search enrichment.
6. Merchant MCP returns:

   * normalized merchant name
   * likely category
   * business type
   * confidence
   * ambiguity flags
   * source snippets
7. Ingestion Agent stores the enrichment result.
8. Ingestion Agent uses the enrichment result during categorization.

### Separation of Responsibilities

| Component           | Responsibility                                     |
| ------------------- | -------------------------------------------------- |
| Ingestion Agent     | Pipeline orchestration and persistence             |
| Merchant MCP Server | Merchant research and web-assisted inference       |
| Advisor Agent       | Conversational reasoning and retrieval composition |
| Analyst Agent       | Deterministic analytics recomputation              |

## 8. State Management and Persistence

### Ingestion Files

Stored in `IngestionFile`.

Includes:

* file metadata
* storage path
* parser output text
* processing status
* current stage
* progress counters
* timestamps
* file-level transaction counts

Stage transitions are recorded in `IngestionFileProcessingEvent`.

### Transactions

Two transaction layers are stored:

| Model                     | Purpose                               |
| ------------------------- | ------------------------------------- |
| `RawExtractedTransaction` | Extracted and normalized staging rows |
| `Transaction`             | Finalized operational records         |

This preserves traceability from uploaded file input to final persisted financial records.

### Analytics

Analytics state is stored in:

* `AnalysisRefreshRequest`
* `FinancialStat`
* `AnalysisSignal`

This supports debounced recomputation and persistent insight retrieval.

### Conversations

Advisor conversations are persisted in:

* `Conversation`
* `ConversationMessage`

Long conversations additionally store summary state:

* `summaryText`
* `summaryUpdatedAt`
* `summarizedMessageCount`

### Review Items

Low-confidence categorization outcomes are stored in `ReviewItem`.

Review items are linked back to raw and finalized transactions.

### Merchant Enrichment

Merchant enrichment outputs are stored in `MerchantEnrichmentResult`.

This supports auditability and reuse.

### Frontend State

The frontend primarily uses local React state per page and component.

There is currently no global client-side state library such as Redux or Zustand.

## 9. Error Handling

### Malformed PDFs or Parser Failures

* parser failures bubble up to the ingestion worker
* file status is marked as failed
* error state is persisted on the ingestion file

### Failed Normalization

* if amount, currency, direction, or date cannot be parsed, the raw row is marked invalid
* an ingestion issue is recorded as a malformed transaction warning

### Duplicate Detection

* exact and fuzzy duplicates are skipped
* the row is marked as skipped duplicate
* an informational ingestion issue is created

### Low-Confidence Categorization

* the transaction is still stored
* category status remains uncategorized
* a review item is created for human follow-up
* an ingestion issue records the low-confidence outcome

### Merchant Enrichment Failures

* merchant enrichment failures are treated as soft failures
* ingestion continues even if MCP enrichment is unavailable
* heuristic fallback behavior exists in the MCP service

### Retryable Queue Jobs

The system uses retries with exponential backoff for:

* ingestion jobs
* analysis refresh jobs
* conversation summary jobs

## 10. Scalability Considerations

The architecture already includes several scalability-friendly patterns:

* independent workers for ingestion, analytics, and conversation summarization
* asynchronous queues for upload processing and recomputation
* modular agents with narrow responsibilities
* separate parser and merchant enrichment services
* Redis-backed caching for repeated merchant lookups
* replaceable model configuration through environment variables
* externalized vector, cache, and relational storage

Current implementation constraints:

* worker concurrency is conservative
* several flows still assume a single demo user
* finance knowledge ingestion into Qdrant is not automated in-repo
* observability is lightweight

## 11. Future Improvements
Excalidraw diagram: 
https://excalidraw.com/#json=MzyypeF4SjXOxOJyOx5F9,vfCpugRpsoN8M-9W6WyFvw

## 12. Future Improvements

Short technical roadmap: 

* add authentication and tenant isolation
* automate finance knowledge ingestion, chunking, embedding, and indexing for Qdrant
* expand file support beyond PDFs
* improve transfer detection
* improve categorization confidence handling
* increase worker concurrency
* add horizontal scalability
* add user auth flow 
* add stronger observability, tracing, and queue monitoring
* support alternative LLM providers more cleanly

