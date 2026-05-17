# Apps Start Commands

## Services in `apps/`

- `fincount`: main API on `3000`, includes file upload endpoints and queues ingestion jobs.
- `ingestion-agent`: worker/API on `3001`, consumes the ingestion queue, depends on Redis, Postgres, `merchant-mcp`, and `parser-service`.
- `analyst-agent`: simple placeholder Nest app on `3002`.
- `advisor-agent`: simple placeholder Nest app on `3003`.
- `merchant-mcp`: MCP server on `3004`, supports HTTP mode by default and `stdio` mode via `MCP_TRANSPORT=stdio`.

## Additional dependency outside `apps/`

- `services/parser-service`: FastAPI PDF parser on `8001`, used by `ingestion-agent`.

## Start infrastructure

Run from the repo root:

```bash
docker compose up -d postgres redis qdrant
```

## Start parser-service

```bash
pip install -r services/parser-service/requirements.txt
uvicorn main:app --app-dir services/parser-service --reload --host 0.0.0.0 --port 8001
```

## Start Nest apps

Run each app in its own terminal from the repo root.

### fincount

```bash
npx nest start fincount --watch
```

### ingestion-agent

```bash
npx nest start ingestion-agent --watch
```

### analyst-agent

```bash
npx nest start analyst-agent --watch
```

### advisor-agent

```bash
npx nest start advisor-agent --watch
```

### merchant-mcp

HTTP mode:

```bash
npx nest start merchant-mcp --watch
```

`stdio` mode:

```bash
MCP_TRANSPORT=stdio npx nest start merchant-mcp --watch
```

## Expected local ports

- `fincount`: `http://localhost:3000`
- `ingestion-agent`: `http://localhost:3001`
- `analyst-agent`: `http://localhost:3002`
- `advisor-agent`: `http://localhost:3003`
- `merchant-mcp`: `http://localhost:3004`
- `parser-service`: `http://localhost:8001`
