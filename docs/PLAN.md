# StudyPilot implementation plan

Confirmed with the user (Stage 0): frontend stays at repo root, backend in
`/backend`, one stage per turn with tests + lint + a done/not-done report, git
commits per stage, no pushes to any remote. Brief: [BRIEF.md](BRIEF.md).

## Stage sequence (11 stages)

| Stage | Scope | Status |
|---|---|---|
| 0 | Setup/audit: dep cleanup, layout, backend scaffold, env templates, READMEs | done |
| 1 | Database: versioned SQL migrations (all tables, indexes, RLS), migrate runner, SQLAlchemy models, JWT verification core + tests, tenant-isolation test | done |
| 2 | Auth wiring: Supabase frontend (client, AuthProvider, ProtectedRoute, apiClient transport), backend `current_user` + `/me` endpoints (GET/PATCH/export/delete) | done | backend + frontend wired (see README)
| 3 | LLM layer: `LLMProvider` (Groq + Gemini), fallback/backoff/circuit breaker, `llm_calls` logging, daily quotas, Quick Ask stream, provider status, fix frontend model labels | done | structured-output repair + embedding cache deferred to Stage 5 (see below) |
| 4 | Ingestion: upload/link endpoints, validation, parsers, chunking, embeddings, pipeline statuses, storage | done |
| 5 | Retrieval + streaming chat: hybrid search (pgvector + FTS + RRF + rerank), SSE `/chat/stream` agents, memory, conversations | done | deferred: LLM reranker is implemented but the default path is score-based (see below) |
| 6 | Study tools: summaries, quizzes, flashcards (SM-2 parity), mind map, planner, weak topics, dashboard, workspace endpoints | pending |
| 7 | Career module: resume parse, gap analysis, bullet rewrite, roadmap, interview generate/evaluate (+optional Whisper transcribe) | pending |
| 8 | Evaluation: corpus, benchmark runner (3 configs), metrics, EvalPage wiring, CLI | pending |
| 9 | Sharing, export, settings: share links, public share view, clone, provider-health panel | pending |
| 10 | Security/quality/ops: rate limits, quotas, CI workflows, Dockerfile, docker-compose, README final | pending |

## Stage 1 — design decisions

- **Plain SQL migrations** in `backend/migrations/NNNN_name.sql`, applied in
  filename order by `backend/scripts/migrate.py` (the brief allows Alembic or
  plain SQL; plain SQL keeps diffs reviewable and has no code-gen coupling).
- **Migrations must run on Supabase Postgres** (where `auth.users` exists).
  To also run them on a bare Postgres (local Docker, CI, the tenant-isolation
  test), the auth trigger is created inside a `DO` block guarded by
  `to_regclass('auth.users')`, and tests bootstrap a minimal `auth` schema
  stub (`auth.users`, `auth.uid()`) plus `anon`/`authenticated` roles.
- **RLS owner-only policies** use `public.current_user_id()` (reads
  `request.jwt.claim.sub`), which works identically under Supabase PostgREST
  and bare Postgres, and avoids depending on `auth.uid()` availability. The
  backend connects as a superuser-ish role that bypasses RLS; policies are
  defense in depth for any anon/authenticated access path.
- **JWT verification** (`backend/app/auth/jwt.py`): JWKS fetch + TTL cache by
  kid (RS256/ES256 via PyJWT[crypto]); HS256 fallback only when
  `SUPABASE_JWT_SECRET` is set and the token has no kid. Always validates
  `exp`, `aud="authenticated"`, `iss=<SUPABASE_URL>/auth/v1`. Failures raise
  401 with a generic message. Unit tests mint real RSA-signed tokens against
  an in-memory JWKS — no network in CI.
- **Tenant-isolation test** creates two fake users (UUIDs, no real Supabase
  accounts), inserts workspaces/documents/chunks/conversations/decks/share
  links for both, then asserts: (a) row-level queries scoped by user_id never
  leak across tenants, including guessed UUIDs and pgvector similarity
  search; (b) RLS blocks cross-tenant reads when acting as
  `authenticated` with A's JWT claims. Runs only when `TEST_DATABASE_URL`
  points at a scratch Postgres (skipped with a clear message otherwise).
- **migrate.py** applies each file in its own transaction, records it in
  `schema_migrations(applied_at, checksum)`, skips already-applied files
  (idempotent), refuses to run if an applied file's checksum changed, and
  never prints connection strings or key material.

## Stage 1 — addenda (user requests)

- `backend/scripts/migrate.py` created as specified above.
- Migrations are self-contained on bare Postgres: `0001_helpers.sql` creates
  minimal `auth.users` + `auth.uid()` stand-ins inside a guarded `DO` block
  only when they are missing (no-op on real Supabase). The test stub
  (`tests/sql/auth_stub.sql`) now creates only the `anon`/`authenticated`
  roles for RLS tests.
- The tenant-isolation test uses two fake users (UUIDs in the stubbed
  `auth.users`) and verifies scoped queries, pgvector similarity search, FTS,
  guessed-UUID access, cross-tenant write blocking (RLS `WITH CHECK`) and
  the no-JWT-claims case. It runs in one transaction that is rolled back.
- JWT tests cover valid, expired, wrong audience, wrong issuer, tampered
  signature, tampered payload, foreign key with spoofed kid, unknown kid,
  HS256 legacy (right/wrong secret, no secret configured), garbage token and
  missing exp — with RSA keys minted in-process, no network.
- Nothing was pushed to any remote.

## Stage 3 — design decisions (LLM layer + Quick Ask)

- **`backend/app/llm/`** is provider-agnostic: `base.LLMProvider` declares
  `generate` / `stream` / `embed`, and only `groq.py` / `gemini.py` know httpx,
  SDK or wire format. Typed models (`ChatMessage`, `LLMRequest`, `StreamDelta`,
  `StreamFinal`, `TokenUsage`, `LLMCallRecord`) cross the boundary; no provider
  type ever leaves its module. Providers take an injectable `httpx.AsyncClient`,
  so every test drives a fake transport and no test touches the network.
- **`LLMRouter`** honours `profiles.default_model`: `auto` = Groq first with a
  fallback to Gemini on 429/5xx/timeout; `groq-llama` / `gemini-long` pin one
  provider (still retried, never silently switched, because the user asked for
  it). Retries use exponential backoff with jitter, capped by
  `LLM_TIMEOUT_SECONDS` per request, and a per-provider circuit breaker
  (`BREAKER_FAILURE_THRESHOLD` consecutive failures opens it for
  `BREAKER_RECOVERY_SECONDS`).
- **Model ids come from env and were verified against provider docs (Oct
  2026)**, not guessed: Groq `openai/gpt-oss-120b` (chat) + `openai/gpt-oss-20b`
  (fast) — the two `llama-*` free/dev-tier ids shut down 2026-08-16
  (console.groq.com/docs/deprecations); Gemini `gemini-3.8-flash` (chat/GA
  2026-09-02) + `gemini-3.1-flash-lite` (fast) + `gemini-embedding-001`
  (embeddings) — `gemini-2.0-flash` shut down 2026-06-01
  (ai.google.dev/gemini-api/docs/{models,changelog,deprecations}).
- **Quotas are reserved before the stream opens** (`usage_counters`, one row
  per user per UTC day, capped at `DAILY_AI_REQUESTS_PER_USER`) so a runaway
  client cannot outrun the cap, and every provider attempt is written to
  `llm_calls`. A cap breach is a normal `429 quota_exceeded` envelope.
- **`POST /ai/quick-ask` streams SSE** (`token` → `done`, or `error` after the
  200). Quota/validation failures are returned *before* the stream as the usual
  JSON envelope; mid-stream provider failures ride the stream with the same
  `{code, message}` shape so the client has one error contract to handle.
- **`GET /ai/status` never fabricates health.** A provider with no API key is
  `not_configured` with no numbers; `ok | degraded | error` is derived from the
  breaker and the last success/failure timestamps, plus today's quota snapshot.
- **Deferred from the original Stage 3 row:** structured-output repair (nothing
  consumes structured outputs until Stage 5's chat/agents) and the embedding
  cache (single-pass ingestion does not benefit yet; revisit with Stage 5
  retrieval).

## Stage 4 — design decisions (ingestion + documents API)

- **`POST /workspaces/{id}/documents`** (multipart) validates in this order:
  capped read → content sniffing (`sniff_type` decides the type, an extension
  that disagrees with the bytes is a 415) → SHA-256 dedupe per workspace (409)
  → `safe_filename` → per-user storage prefix `{user}/{workspace}/{doc}/{name}`.
  Quotas: `MAX_DOCUMENTS_PER_USER`, `MAX_STORAGE_BYTES_PER_USER`,
  `DAILY_UPLOAD_QUOTA_PER_USER`.
- **Links** (`POST /workspaces/{id}/documents/link`) run SSRF validation on the
  URL *and on every redirect hop*, block non-http(s) schemes, private/loopback
  hosts, and enforce the YouTube URL shape before anything is stored.
- **Pipeline** (`app/ingestion/pipeline.py`) is a FastAPI background task that
  owns its own DB session (the request session is closed before the task runs):
  `queued → parsing → chunking → embedding → ready`, with `error` carrying a
  safe user-facing message — never a stack trace (unexpected exceptions are
  logged server-side and replaced by a generic message). Startup runs
  `recover_stuck_documents`, which fails documents interrupted mid-flight and
  leaves `queued` ones alone.
- **Chunking** keeps `char_start`/`char_end` offsets per page, guarantees a
  minimum overlap (paragraph-snapped), and hard-cuts oversized paragraphs
  instead of dropping text. Embeddings are written to `chunks.embedding`
  (`vector(384)`); the default embedder is local (`intfloat/multilingual-e5-small`)
  with `EMBEDDING_PROVIDER=gemini` as the no-install alternative.
- **Delete** removes the row (cascading chunks) and the whole storage prefix;
  storage failure aborts with a message that says nothing else was deleted.
- Everything is covered by live-HTTP tests against the scratch Postgres with a
  `FakeAdmin` (in-memory storage), so no test touches Supabase Storage.

## Stage 5 — design decisions (retrieval + chat)

- **`app/retrieval/` is one pipeline**: cached query embedding → pgvector
  top-N + FTS top-N → Reciprocal Rank Fusion → top-k → optional rerank. The
  query is embedded through the *same* router embedder as ingestion
  (`task="query"`, so e5 gets its `query: " "` prefix and Gemini does not),
  and results are cached in a process-local TTL+LRU cache keyed by
  provider/model/task/text hash (`EMBEDDING_CACHE_*`) — Stage 3's deferred
  embedding cache, delivered here where repeated questions actually pay off.
- **RRF** (`search.py`) uses `score = Σ 1/(k + rank)` with a 1-based rank,
  normalised so 1.0 means "first in every list"; ties break by chunk id so the
  context never shuffles between identical calls. A chunk seen by both rankers
  keeps the best vector score, best ts_rank and best initial rank.
- **Tenant isolation is in the SQL**: every statement filters `user_id` *and*
  `workspace_id`, and the document filter can only narrow further. A guessed
  chunk id, a look-alike embedding or another tenant's workspace id returns
  nothing (covered by tests in `test_retrieval_db.py` and `test_chat_api.py`).
- **The reranker is behind an interface with no heavy dependency**: `score`
  (default; deterministic blend of vector similarity, normalised FTS score and
  lexical overlap), `llm` (fast model returns an ordering as JSON, 4 s budget,
  one repair retry, falls back to the fused order) and `none`. `flashrank`/`bge`
  remain accepted env values but resolve to `score` unless you install those
  packages yourself — the original `RERANKER_PROVIDER=flashrank` default was
  changed because nothing consumed it yet and it silently required a package
  this project does not depend on. The path actually taken is logged and
  recorded in the trace (`rerankerScore` is the fused score when no rerank ran).
- **Embedding failure degrades to FTS** (`mode: "fts"`) instead of failing the
  request: a keyword match is still a grounded match, and `vectorScore` is
  null in the trace rather than invented.
- **`POST /chat/stream` mirrors the mock's event sequence exactly** — `trace`
  (Planner), `retrieval`, `trace` (Retriever), `token`* , `citation`,
  `critic`, `done` — with an `error` event carrying `{code, message}` after the
  200, the same contract as Quick Ask. Token data is a **plain string** (the
  mock's shape), not quick-ask's `{text}` object. Quota/validation failures
  return before the stream opens; chat consumes the same daily AI quota.
- **Grounding is enforced after generation, not trusted from the model**:
  every `[n]` must map to a retrieved chunk (dead markers are stripped from
  the answer, duplicates keep one citation object), and each citation is built
  from the chunk row — document id/name, page or timestamp, snippet, the
  grounding score as confidence. The model can point at a source; it cannot
  invent one.
- **Abstention before guessing**: below `NOT_FOUND_SCORE_THRESHOLD` (or with no
  hits) the assistant answers with a fixed, statically translated line
  (en/ta/hi) and `isNotFound` is persisted. General knowledge requires the
  explicit `generalKnowledge` flag and such answers start with
  `General knowledge:`. The critic is skipped for abstentions (there is no
  claim to check) and confidence is pinned at 100/high — nothing was claimed.
- **Prompt injection**: retrieved text, saved memory and the question are all
  untrusted data — context sits between `BEGIN/END RETRIEVED CONTEXT` markers,
  the question inside `<question>`, memory inside `<memory>`; role-like line
  prefixes (`system:`, `assistant:`) are neutralised to `·` so a document
  cannot impersonate a turn, and the system prompt grants no tools or actions.
  Covered by `test_chat_grounding.py` and an end-to-end prompt assertion in
  `test_chat_api.py`.
- **The critic** (`app/chat/critic.py`) is a cheap JSON fact-check over the
  answer + retrieved passages, produced by the Stage 5 structured-output
  helper (`app/llm/structured.py`: tolerant JSON parse, schema validation,
  **one repair retry** — Stage 3's other deferral, delivered). Whatever happens
  — no key, rate limit, timeout, unparseable output, disabled — the answer still
  ships and the verdict says `skipped`. Confidence comes from
  `grounding.confidence_for()` (top-passage similarity moved by the verdict),
  never from the model's own say-so.
- **Persistence**: the user's message is written before retrieval (a sent
  question is never lost) and the assistant's message afterwards — including a
  partial one on abort, marked `interrupted: true`. Each assistant message
  stores `model`, `usage`, `citations`, `reasoning_trace`,
  `retrieval_inspection` and `retrieval_meta` (mode, rerank path, embedder,
  config, timings, chunk ids + scores) so Stage 8 can replay retrieval; no
  prompt or completion text is written anywhere outside `messages`.
- **Abort really cancels**: closing the SSE generator closes the inner LLM
  stream (generator `aclose()` is chained through the layers), which cancels
  the provider request; the partial tokens streamed before the abort are kept.
  Tested directly (`test_aborting_the_stream_cancels_the_upstream_call...`).
- **Memory is explicit**: facts are only written by `POST /workspaces/{id}/memory`
  (never extracted from what the model says), recalled pinned-first and
  injected as a small labelled `<memory>` block when `memoryEnabled`.
