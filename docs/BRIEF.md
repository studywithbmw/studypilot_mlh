# PROJECT BRIEF: StudyPilot backend + Supabase auth wiring

You are a senior backend/full-stack engineer (10+ years, production RAG and auth experience). The React frontend already exists in this repo (Vite + React 19 + TS + Tailwind 4 + zustand + TanStack Query). It currently runs entirely on mock data. Your job: build the real FastAPI backend and wire the frontend to it, with Supabase for auth, Postgres, pgvector and file storage, and Groq + Gemini as LLM providers. Everything must run on free tiers.

======================================================
0. RULES OF ENGAGEMENT
======================================================
- Work in the stages I give you, one at a time. At the end of each stage: run the tests and `npm run lint` (tsc), list what you did and what you did NOT do, then STOP and wait for me.
- Never leave the app broken between stages. Keep VITE_USE_MOCK=true working as a "demo mode" that needs no backend and no Supabase.
- No fake data in real mode. No hardcoded metrics, no silent fallback to mock when a real call fails (show an error state instead). No TODO stubs presented as done. If something is not finished, say so.
- Do not invent features outside this brief. If the brief conflicts with the repo, tell me, propose a fix, and continue with the safest option.
- Secrets: only in backend env vars. The frontend may use ONLY VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (public by design), VITE_API_URL, VITE_USE_MOCK. Never put the service-role key, DB password, Groq key or Gemini key in the frontend, in a VITE_ variable, or in git. Provide .env.example files with placeholder values only.
- Provider facts change (model names, free-tier limits, Supabase JWT behavior). Make all model names and limits environment variables, and check each provider's current docs before hardcoding anything.
- Small commits with clear messages. Add tests for every non-trivial module.

======================================================
1. WHAT THE FRONTEND ALREADY CONTAINS (verified)
======================================================
- src/types/index.ts and the mock implementations in src/lib/api/apiClient.ts are the SOURCE OF TRUTH for request/response shapes. src/lib/api/README.md is stale and incomplete: rewrite it at the end of every stage to match what you really implemented.
- apiClient.ts exports `api` with these methods (all mock-only today): login, signup, getProfile, updatePreferences, getWorkspaces, createWorkspace, deleteWorkspace, getDocuments, uploadDocument (with onProgress), addLinkDocument, deleteDocument, getConversations, createConversation, streamChatMessage (async generator yielding {type: 'trace'|'retrieval'|'token'|'citation'|'critic'|'done', data}), quickAsk, generateSummary, getQuizzes, generateQuiz, submitQuiz, getDecks, rateFlashcard, generateDeckFromDocument, getWeakTopics, analyzeSkillGap, rewriteBullet, getRoadmap, getInterviewQuestions, evaluateInterview, getStudyPlan, getRAGEvalMetrics, getRAGEvalTestCases, runEvaluationSuite, getMemoryFacts, addMemoryFact, deleteMemoryFact, togglePinMemoryFact.
- Auth today is fake: useAuthStore starts logged in with MOCK_USER and a fake token; AppShell has no guard; the Google button is a stub; forgot-password does nothing; onboarding data is only kept in local state.
- useWorkspaceStore seeds MOCK_WORKSPACES and persists the list to localStorage. useStudyTrackerStore keeps study sessions only in localStorage.
- Routes: /, /login, /signup, /forgot-password, /onboarding, /share/:token, /design, /app/{index,ask,chat,documents,summaries,quizzes,flashcards,mindmap,planner,weak-topics,career,eval,settings}. There is no workspace id in the URL; the active workspace comes from useWorkspaceStore and must be passed to the API as workspaceId.
- Dev server runs on port 3000.
- Leftover AI Studio deps (@google/genai, express, dotenv): confirm they are unused, then remove them.

======================================================
2. ARCHITECTURE
======================================================
Browser (Vercel) --Supabase JS--> Supabase Auth (email+password, Google OAuth)
Browser --Bearer <Supabase access token>--> FastAPI (Hugging Face Space, Docker, port 7860)
FastAPI --> Supabase Postgres (pgvector + FTS), Supabase Storage (private bucket "documents"), Groq, Gemini, local embedding/reranker models.

Backend stack: Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2 async + asyncpg (or psycopg3), Alembic or plain SQL migrations in /backend/migrations, httpx, PyJWT[crypto], slowapi (rate limits), structlog, pytest + pytest-asyncio + httpx test client, ruff, mypy-lite. Repo layout: /frontend (move the existing app here ONLY if I approve in Stage 0; otherwise keep it at root and put the backend in /backend), /backend, /docs, /eval, /.github/workflows.

API conventions:
- Base path /api/v1. JSON keys are camelCase (Pydantic alias_generator=to_camel, populate_by_name=True, responses by alias). Dates are ISO-8601 UTC strings. IDs are UUID strings.
- Errors: {"error": {"code": "...", "message": "...", "requestId": "..."}} with correct HTTP status. Frontend shows these in toasts.
- Every request gets a request id (header X-Request-ID). Endpoints /health (liveness) and /ready (checks DB).

======================================================
3. AUTH DESIGN (Supabase)
======================================================
The backend NEVER sees passwords. Supabase Auth handles signup, login, Google, password reset and token refresh. The old POST /auth/login and POST /auth/signup endpoints are removed.

Backend:
- Dependency `current_user` reads Authorization: Bearer <access_token> and verifies it: fetch and cache the project's JWKS from https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json (asymmetric signing keys, check kid) and fall back to HS256 with SUPABASE_JWT_SECRET for legacy projects. Validate signature, exp, aud="authenticated", and iss. Return user_id (sub) and email. 401 on any failure. Unit-test valid, expired, wrong-audience, tampered and wrong-key tokens.
- Table `profiles` (id = auth.users.id): name, avatar_url, role, goal, subjects[], onboarded bool, streak fields, and all preference columns from UserProfile (preferredLanguage, defaultModel, defaultExplanationLevel, hybridSearchEnabled, rerankerEnabled, topK, memoryEnabled). Create it with a DB trigger on auth.users insert (copy name/avatar from raw_user_meta_data) AND make GET /me upsert defensively.
- Endpoints: GET /me (returns UserProfile), PATCH /me (name, goal, subjects, onboarded, preferences), GET /me/export (JSON of everything the user owns), DELETE /me (delete storage objects, rows, then the Supabase auth user via the admin API with the service-role key; require a confirmation string in the body).
- Data access: backend connects with the DB connection string (bypasses RLS) and MUST filter by user_id in every query through a shared repository layer; no raw query may omit it. ALSO enable RLS on every table with owner-only policies as defense in depth. Use the Supabase pooler connection string; if using the transaction pooler (port 6543) disable asyncpg prepared statement caching (statement_cache_size=0). The direct DB host can be IPv6-only on the free tier, so prefer the pooler.
- A mandatory test: user A cannot read, modify, search, or cite user B's workspaces, documents, chunks, chats, decks or share links (including via guessed IDs and via vector search).

Frontend:
- Add @supabase/supabase-js. Create src/lib/supabase.ts (client with persistSession and autoRefreshToken). Create an AuthProvider that subscribes to onAuthStateChange and hydrates the auth store.
- Rewrite useAuthStore: no fake default user; no token persisted by us (supabase persists the session). State: session/user, profile (from GET /me), isOnboarded (from profile.onboarded), loading. Actions: login(email,password), signup(name,email,password), loginWithGoogle(), sendPasswordReset(email), updatePassword(newPassword), logout(), updateProfile(), completeOnboarding(goal, subjects, language) which PATCHes /me.
- signup: supabase.auth.signUp with options.data={name}. If email confirmation is enabled there is no session yet: show a clear "check your email" state instead of navigating. Handle "user already registered", wrong password, and unconfirmed email with friendly messages.
- Google: supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo: window.location.origin + '/app'}}). A first-time Google user with onboarded=false must be redirected to /onboarding.
- Forgot password: resetPasswordForEmail with redirectTo origin + '/reset-password'. Add the /reset-password route/page (listen for the PASSWORD_RECOVERY event, then updateUser({password})), matching the existing AuthPage design.
- Add <ProtectedRoute> around /app/* and /onboarding (redirect to /login?next=...); redirect logged-in users away from /login and /signup. /share/:token stays public.
- apiClient: a single request helper attaches `Authorization: Bearer <session.access_token>` (read via supabase.auth.getSession() on each call), sets base URL from VITE_API_URL, maps error bodies to thrown typed errors, on 401 tries one session refresh then signs out. The streaming call uses fetch + ReadableStream parsing of SSE (EventSource cannot send POST or headers) and supports AbortController for "Stop generating".
- On logout: queryClient.clear(), reset the workspace/settings/study-tracker stores and clear their localStorage keys so the next user never sees the previous user's data.
- Stop persisting server-owned lists (workspaces, documents, etc.) in localStorage; keep only UI preferences (active workspace id, theme, language).
- Keep VITE_USE_MOCK=true as demo mode: mock session, no Supabase calls.

======================================================
4. DATABASE (Supabase Postgres)
======================================================
Enable extensions: vector, pgcrypto. Put everything in versioned migrations in /backend/migrations. Every table has user_id (uuid, references auth.users on delete cascade), created_at, and RLS owner-only policies. Index every foreign key and user_id.

Tables (finalize columns in Stage 1 from src/types/index.ts): profiles; workspaces (name, description, color, emoji, is_archived); documents (workspace_id, name, type, size_bytes, page_count, duration_seconds, source_url, storage_path, status, progress_percent, error, content_hash); document_pages (document_id, page_number, text) for the viewer; chunks (document_id, workspace_id, page_number, timestamp_start, char_start, char_end, text, embedding vector(384), tsv tsvector generated using the 'simple' config, with an HNSW cosine index and a GIN index on tsv); conversations (workspace_id, title, document_scope jsonb, explanation_level, answer_language, model, is_pinned); messages (conversation_id, role, content, citations jsonb, confidence_score, confidence_tier, is_not_found, is_general_knowledge, used_memory, resolved_query, explanation_level, reasoning_trace jsonb, retrieval_inspection jsonb, feedback smallint, interrupted bool); memory_facts (workspace_id, fact, is_pinned, embedding); summaries; quizzes (questions jsonb); quiz_attempts (quiz_id, answers jsonb, score_percent); decks; cards (deck_id, front, back, topic, source_doc_id, repetition, interval_days, ease_factor, due_date, last_reviewed_at); card_reviews (card_id, rating, reviewed_at); topic_stats (workspace_id, topic, correct, total, last_practiced, recent jsonb); study_plans; study_tasks; study_sessions (date, minutes, subject, activity_type, notes); career_analyses; roadmap_milestones; interview_questions; interview_attempts; share_links (workspace_id, token_hash, scopes jsonb, expires_at, revoked_at, view_count); eval_runs; eval_cases; llm_calls (provider, model, purpose, tokens_in, tokens_out, latency_ms, status, cost_estimate); usage_counters (user_id, day, llm_calls, uploads).

Storage: private bucket "documents", object path {user_id}/{workspace_id}/{document_id}/{filename}. The backend uploads with the service-role key; the browser never touches the bucket directly.

Share tokens: generate 32 random bytes (urlsafe), store only a hash, compare in constant time.

======================================================
5. INGESTION PIPELINE
======================================================
POST /workspaces/{id}/documents/upload (multipart) and /documents/link:
- Validate: extension AND magic bytes, max size (env, default 20 MB), per-user document and storage quotas, content-hash dedupe within a workspace. Reject with a clear error.
- Create the document row (status "queued") and return 202 immediately. Process in a background task with statuses queued -> parsing -> chunking -> embedding -> ready | error, updating progress_percent at each step. On startup, mark documents stuck in an in-progress state as error with a retry option. Provide POST /documents/{id}/retry.
- Parsers: PDF via PyMuPDF (keep page numbers; if a PDF has no extractable text, set error "scanned PDF, no text found" rather than failing silently), DOCX via python-docx, PPTX via python-pptx (slide number = page), TXT/MD plain, web URL via trafilatura, YouTube via youtube-transcript-api with start timestamps per segment. YouTube often blocks cloud IPs: on failure set a clear error and accept a pasted transcript as a fallback input. Web fetch must be SSRF-safe: https/http only, resolve DNS and block private/loopback/link-local IPs, limit redirects, timeout, and max response size.
- Chunking: page/segment-aware, about 500-700 tokens with 10-15% overlap, never crossing a page boundary unless the page is tiny; store page_number or timestamp, plus char_start/char_end within the page so the viewer can highlight the exact passage. Language-agnostic sentence splitting (must not break on Tamil/Hindi text).
- Embeddings: sentence-transformers intfloat/multilingual-e5-small (384 dims, covers Tamil/Hindi/English). Remember the e5 prefixes: "passage: " for chunks, "query: " for queries. Batch encode. Make the provider switchable by env (EMBEDDING_PROVIDER=local|gemini) but the column dimension is fixed, so document the migration needed to switch.
- Endpoints: GET /workspaces/{id}/documents (search, type, status), GET /documents/{id} (metadata + chunk count), GET /documents/{id}/pipeline-status ({status, progress, error}), GET /documents/{id}/pages/{n} (page text for the viewer), DELETE /documents/{id} (rows + storage + chunks).

======================================================
6. RETRIEVAL + MULTI-AGENT CHAT
======================================================
Retrieval (all scoped by user_id, workspace_id and the conversation's documentScope):
- Vector: pgvector cosine top-N (N=30). Keyword: Postgres FTS with the 'simple' config and ts_rank_cd (name this honestly in code and docs as BM25-style keyword scoring; the UI field is bm25Score). Fuse with Reciprocal Rank Fusion (k=60). Rerank the fused top 20 with a cross-encoder (FlashRank, or bge-reranker-base if memory allows). Respect the request flags hybridSearch, reranker, topK (when off, skip that stage). Record initialRank, fusedRank, finalRank and every score so the UI's RetrievalInspector shows real numbers.
- Not-found handling: if the best reranker/similarity score is below a configurable threshold, return the not-found state (isNotFound=true, no citations) and offer a general-knowledge answer ONLY when the request has allowGeneralKnowledge=true, clearly flagged isGeneralKnowledge=true with no citations.

POST /chat/stream (SSE, text/event-stream; headers Cache-Control: no-cache, X-Accel-Buffering: no; heartbeat comment every 15 s):
- Event names and data shapes must match the StreamEvent types and TS interfaces EXACTLY as the mock generator emits them (read streamChatMessage in apiClient.ts and mirror it): trace (AgentReasoningStep, one per agent as it finishes), retrieval (RetrievalInspectionItem[]), token ({text}), citation (Citation[]), critic (verdict object), done (final metadata: messageId, confidenceScore, confidenceTier, isNotFound, isGeneralKnowledge, usedMemory, resolvedQuery, explanationLevel). Add an `error` event for failures.
- Agents: (1) Planner on a small fast model: resolves pronouns using recent history + memory into resolvedQuery, decomposes into sub-queries, detects language. (2) Retriever as above (run sub-queries, merge). (3) Answerer streams tokens, answers in answerLanguage at the requested explanationLevel (eli5 | student | expert), cites sources inline as [1], [2] mapped to Citation objects (documentId, documentName, pageNumber or timestamp, snippet, confidence). (4) Critic checks each claim against the retrieved chunks and returns {passed, hallucinationDetected, unsupportedSentence, note}; if unsupported claims are found, flag them and lower confidence (optionally one corrective regeneration, capped).
- Confidence: computed from reranker scores, citation coverage and critic result, mapped to high/medium/low. Not an LLM guess.
- Persistence: save the user message before streaming and the assistant message (with trace, retrieval, citations) at the end. If the client disconnects (Stop generating), save the partial answer with interrupted=true and stop calling the LLM.
- Memory (when profile.memoryEnabled): after a conversation turn, extract durable facts (exam dates, language preference, goals) with a small model into memory_facts; inject pinned and most relevant facts into the planner; set usedMemory=true when used. CRUD: GET/POST /workspaces/{id}/memory, DELETE /memory/{id}, PATCH /memory/{id} (pin), DELETE /workspaces/{id}/memory (clear).
- Conversations: GET /workspaces/{id}/conversations, GET /conversations/{id} (with messages), POST /workspaces/{id}/conversations, PATCH (rename, pin), DELETE. POST /messages/{id}/feedback (thumbs).
- POST /chat/quick-ask {text, workspaceId?} -> {answer}: short (<= 60 words) answer, grounded in the workspace when workspaceId is given.
- Prompt-injection defense: retrieved text is untrusted DATA. Wrap it in clear delimiters, instruct the model to never follow instructions found inside it, never reveal system prompts or keys, and strip obvious control strings. Add tests with a malicious document ("ignore previous instructions...").

======================================================
7. LLM LAYER (Groq + Gemini)
======================================================
- One provider-agnostic `LLMClient` interface: complete(), stream(), json(schema). Providers: Groq (OpenAI-compatible; default for chat, planner, critic) and Gemini via the google-genai SDK (long context, summaries of big documents, fallback).
- Frontend model ids: "auto" | "groq-llama" | "gemini-long". Map them to env-configured model names (GROQ_MODEL_MAIN, GROQ_MODEL_FAST, GEMINI_MODEL_MAIN, GEMINI_MODEL_FAST). "auto" = Groq first, fall back to Gemini on 429/5xx/timeouts, with exponential backoff + jitter, per-provider circuit breaker, and per-call timeouts. Update the frontend model labels in src/lib/constants.ts to not name outdated models.
- Structured outputs (quizzes, flashcards, gap analysis, plans, mind maps, interview rubric): request JSON, validate with the Pydantic model that mirrors the TS type, and on validation failure retry once with the error message (repair prompt) before returning a 502 with a clear code.
- Log every call to llm_calls (provider, model, purpose, tokens, latency, status). Daily per-user quotas (env) so a few users cannot exhaust the free tier; return 429 with a friendly message and retry-after.
- Cache: embeddings by content hash; summaries per (document, level, language).

======================================================
8. STUDY TOOLS
======================================================
- Summaries: POST /summaries/generate {workspaceId, documentId?, level: short|detailed|bullet|terms, language?, tone?, explanationLevel?}. Map-reduce for long documents. Return SummaryNote with citations. GET /workspaces/{id}/summaries, POST to save as notes, DELETE.
- Quizzes: POST /quizzes/generate {workspaceId, topic?, documentIds?, types[], difficulty, count, timedMinutes?}. Questions generated ONLY from retrieved chunks, each with topic tag, explanation and a citation. POST /quizzes/{id}/submit: grade MCQ and true/false deterministically; grade short answers with the LLM (score 0-100 + feedback); store the attempt; update topic_stats; log a study session. GET /workspaces/{id}/quizzes (history).
- Flashcards: GET /workspaces/{id}/flashcards/decks, POST decks, POST /decks/{id}/cards, PATCH/DELETE cards, POST /documents/{id}/flashcards/generate (generateDeckFromDocument), POST /flashcards/rate {deckId, cardId, rating} returning the updated deck/card as the frontend expects. Port src/lib/sm2.ts to Python line by line and add a parity test with a shared table of test vectors that the vitest test also asserts, so both implementations provably agree.
- Mind map: POST /mindmap/generate {documentId} -> {nodes, edges} in the shape the MindMap page expects (read it; nodes carry label, summary, optional citation). The frontend has no api method for this yet: add one.
- Planner: POST /planner/generate {workspaceId, targetExamDate, dailyHours, weakTopicPriority, documentIds?}. Use DETERMINISTIC scheduling (topics extracted once by the LLM, then allocation by weight, weak topics first, daily minutes cap, spaced revision days, last days for mock tests and revision). GET /workspaces/{id}/plan, PATCH /tasks/{id} (complete/uncomplete), POST /plans/{id}/reschedule-missed.
- Weak topics: GET /workspaces/{id}/weak-topics computed from topic_stats and card reviews (accuracy %, trend by comparing the latest window to the previous one, lastPracticed, suggestedAction, flashcardDeckId).
- Study tracker + dashboard: POST /study/sessions, GET /study/sessions?from&to, GET /dashboard/summary (streak days, cards due, avg quiz score, topics mastered, heatmap data for the last 12 weeks, recent documents, upcoming tasks). Replace the localStorage-only logic in useStudyTrackerStore with API-backed data (keep the timer UI state local).
- Workspace endpoints: GET/POST /workspaces, PATCH /workspaces/{id} (rename, color, emoji, archive), DELETE (cascade, including storage). Counts (documentCount, deckCount, quizCount) are computed.

======================================================
9. CAREER MODULE
======================================================
- POST /career/resume/parse (PDF/DOCX upload, same validation) -> {text}. Store resumes privately.
- POST /career/analyze-gap {resumeText, jobDescriptionText} -> SkillGapAnalysis. Combine deterministic keyword coverage (normalized skills taxonomy) with LLM judgment; resumeScoreBreakdown and atsChecklist come from the model but are validated against the schema. Persist and list past analyses.
- POST /career/rewrite-bullet {bullet, mode: quantified|concise} -> BulletRewriteItem. Never invent numbers: when quantifying, use placeholders like [X%] unless the user's text contains the figure, and say so in diffSummary.
- GET/POST /career/roadmap generated from the latest gap analysis, PATCH /roadmap/{id} to complete a milestone.
- POST /career/interview/generate {jobDescriptionText?, workspaceId?, type, difficulty, count}: questions from the JD and retrieved workspace notes, each with source tag JD|Notes|Mixed and sourceNoteTitle.
- POST /career/evaluate-interview {questionId, transcript, durationSeconds} -> InterviewFeedback. Compute fillerCount, fillerWords and speakingPaceWpm DETERMINISTICALLY in code (English, Tamil and Hindi filler lists), and use the LLM only for the rubric (clarity, depth, structure, confidence), strengths, improvements and modelAnswer.
- Optional upgrade: POST /career/transcribe (audio upload) using Groq Whisper for better Tamil/Hindi accuracy; the Web Speech API stays the default and the UI must still work without it.

======================================================
10. EVALUATION (resume-grade, honest numbers)
======================================================
- /eval folder with a small sample corpus (2-3 openly licensed or self-written documents) and 40-60 question/answer pairs with ground-truth chunk references. Generate candidates with an LLM, then I review them; mark clearly which ones are unreviewed.
- Metrics, computed for three configs (vector-only baseline, hybrid, hybrid + reranker): faithfulness and answer relevance (LLM-as-judge with a fixed rubric prompt; document the judge model and temperature 0), context precision and context recall (against ground-truth chunks), average latency, cost per query (from llm_calls). Do not hardcode any score anywhere.
- POST /eval/run-benchmark starts a background run and returns a run id; GET /eval/runs/{id} returns progress; GET /eval/metrics and /eval/test-cases return the latest completed run in the shapes RAGEvalMetric[] and RAGEvalTestCase[]. Wire the existing EvalPage to them (the "Run evaluation" button shows real progress). Also provide a CLI `python -m eval.run` that writes eval/results.json and a markdown table for the README.

======================================================
11. SHARING, EXPORT, SETTINGS
======================================================
- POST /workspaces/{id}/share {scopes: documents|summaries|flashcards|chats, expiry: never|7days|30days}, GET list, DELETE (revoke). Public read-only GET /public/share/{token} (no auth, rate-limited, returns only the allowed scopes, never user ids/emails/storage paths), POST /share/{token}/clone (auth required, copies into the caller's account within quotas). Wire ShareDialog and SharedWorkspacePage.
- Export stays client-side (useExport); no backend work except GET /me/export.
- Settings page: persist preferences via PATCH /me; the "provider health" panel calls GET /health/providers (real status of Groq, Gemini, DB, embedding model; no secrets).

======================================================
12. SECURITY, QUALITY, OPS
======================================================
- CORS: allowlist from env (http://localhost:3000, the Vercel domain). No wildcard with credentials.
- Rate limits per user (slowapi keyed by user id, per IP for public routes), stricter on LLM and upload endpoints. Request body size limits. Timeouts everywhere.
- Logging: structured, no tokens or document text in logs. Optional Langfuse tracing behind an env flag.
- Tests (pytest): JWT verification, tenant isolation, chunking (incl. Tamil/Hindi text), RRF, SM-2 parity, SSRF guard, upload validation, SSE contract (event order and JSON shapes parse into the TS-equivalent Pydantic models), quota enforcement, prompt-injection fixture. Use fake LLM and embedding providers for deterministic CI. Frontend: keep vitest passing, add tests for the auth store and the apiClient error/refresh handling.
- CI (GitHub Actions): backend ruff + pytest, frontend lint (tsc) + vitest + build.
- Deployment: backend Dockerfile for a Hugging Face Docker Space (port 7860, non-root user, writable HF_HOME/model cache, models pre-downloaded at build time, uvicorn with workers=1 to fit memory); docker-compose for local dev; `.env.example` listing every variable (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET (legacy only), DATABASE_URL, GROQ_API_KEY, GEMINI_API_KEY, model names, quotas, ALLOWED_ORIGINS, EMBEDDING_PROVIDER, and so on). README sections: architecture diagram, local setup, deployment, API reference link, eval results table, known limitations.

======================================================
13. DEFINITION OF DONE (whole project)
======================================================
A new user can: sign up (email or Google) -> onboard -> create a workspace -> upload a PDF, a DOCX, a web link and a YouTube link -> watch the pipeline reach Ready -> chat with streamed cited answers whose citations open the right page with the passage highlighted -> generate summaries, a quiz, flashcards, a mind map, a plan -> run a gap analysis and a mock interview -> see real dashboard and eval numbers -> share a workspace link. Another user cannot see any of it. All tests and CI pass. No secret is in the frontend bundle or in git history.
