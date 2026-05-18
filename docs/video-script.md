# Demo Script

## 1. Introduction
- Project overview
- Problem statement
- Multi-agent finance assistant

---

## 2. High-Level Architecture
- Frontend
- Main API
- Queues
- Agents
- PostgreSQL / Redis / Qdrant
- MCP + RAG overview

---

## 3. Ingestion Agent
### Demo
- Upload PDF
- Queue processing
- Transactions extracted

### Architecture
- Parser service
- Normalization
- Categorization
- Persistence
- Async jobs

---

## 4. Merchant MCP Server
### Demo
- Merchant enrichment
- Category inference

### Architecture
- MCP communication
- Web-assisted enrichment
- Caching
- Tool separation

---

## 5. Analyst Agent
### Demo
- Analytics
- Signals
- Trends

### Architecture
- Analysis refresh jobs
- Stats computation
- Signal persistence

---

## 6. Advisor Agent
### Demo
- Advisor chat
- Financial questions
- Insights

### Architecture
- LangChain tools
- SQL-backed retrieval
- Qdrant RAG
- Conversation persistence

---

## 7. Testing
- Positive scenarios
- Negative scenarios
- Edge cases
- Automated tests

---

## 8. Closing
- What was built
- Lessons learned
- Future improvements