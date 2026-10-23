# StudyPilot API layer — frontend ⇄ backend contract

**Status (end of Stage 5): auth, workspaces, Quick Ask, provider status,
documents, chat (streamed, cited), conversations and memory are real; study
tools, career and eval are still demo data.** With `VITE_USE_MOCK=false` these
`api` methods call FastAPI over HTTP (`src/lib/api/http.ts`): `getProfile`,
`updatePreferences`, `exportMyData`, `deleteAccount`, `getWorkspaces`,
`createWorkspace`, `updateWorkspace`, `deleteWorkspace`, `getDocuments`,
`uploadDocument`, `addLinkDocument`, `deleteDocument`, `reprocessDocument`,
`quickAsk`, `getAIStatus`, `getConversations`, `createConversation`,
`renameConversation`, `deleteConversation`, `streamChatMessage`,
`getMemoryFacts`, `addMemoryFact`, `deleteMemoryFact`, `togglePinMemoryFact`.
Every other method still returns in-memory mock data in both modes
(workspace-scoped lists are simply empty for real workspaces). This file is
rewritten at the end of every stage.

Auth: Supabase Auth owns signup/login/Google/reset in the browser
(`src/store/useAuthStore.ts`); `http.ts` attaches the access token, refreshes
once on a 401, and signs the user out if it is still rejected.

## Source of truth

- `src/types/index.ts` — all request/response TypeScript interfaces.
- `src/lib/api/apiClient.ts` — exports `api` with the full method surface below.
- The backend mirrors every type with camelCase Pydantic models (`alias_generator=to_camel`,
  `populate_by_name=True`) and must match the mock's shapes exactly,
  including the SSE event sequence emitted by `streamChatMessage`.

## Transport contract (implemented on both sides)

- Base path: `/api/v1` (`VITE_API_URL`, e.g. `http://localhost:7860/api/v1`).
- Auth: `Authorization: Bearer <Supabase access token>`; verified server-side via
  JWKS (or HS256 `SUPABASE_JWT_SECRET` fallback). **There are no
  `POST /auth/login` or `POST /auth/signup` endpoints — Supabase Auth owns
  signup/login/Google/password-reset.** The backend exposes `GET/PATCH /me`,
  `GET /me/export`, `DELETE /me`.
- Errors: `{"error": {"code", "message", "requestId"}}` with the right HTTP
  status. Every response carries `X-Request-ID`.
- Uploads: `POST /workspaces/{id}/documents` is multipart. `fetch` cannot report
  upload progress, so `uploadDocument` uses `XMLHttpRequest` for the request body
  only (auth, envelope and 401 handling are unchanged) and reports
  `onProgress(percent, 'uploading' | 'parsing' | 'ready')`. Percent stops at 99
  until the response arrives, because parsing happens server-side.
- Streaming: `POST /ai/quick-ask` and `POST /chat/stream` return
  `text/event-stream`, parsed with `fetch` + `ReadableStream`
  (`apiSSEStream` + `parseSSEStream` — not `EventSource`, which cannot send
  POST/headers). Each stream has a hard no-client-deadline rule: the server
  closes it when done; aborting is `AbortSignal`. **Aborting a chat stream is
  not cosmetic**: the browser drops the connection, the server closes its LLM
  stream (cancelling the provider call) and persists the partial answer with
  `interrupted: true`.

## `api` method surface

| Group | Methods | Real / mock |
|---|---|---|
| Auth | `login(email)`, `signup(name, email)` (Supabase), `getProfile()`, `updatePreferences(updates)`, `exportMyData()`, `deleteAccount()` | real (Stage 2) |
| Workspaces | `getWorkspaces()`, `createWorkspace(name, color, emoji)`, `updateWorkspace(id, patch)`, `deleteWorkspace(id)` | real (Stage 2) |
| Documents | `getDocuments(workspaceId?)`, `uploadDocument(workspaceId, file, onProgress?)`, `addLinkDocument(workspaceId, url, type)`, `deleteDocument(id)`, `reprocessDocument(id)` | **real (Stage 4)** |
| AI | `quickAsk(text, { level?, language?, signal?, onToken? })`, `getAIStatus()` | **real (Stage 3)** |
| Chat / RAG | `getConversations(workspaceId?)`, `createConversation(workspaceId, title)`, `renameConversation(id, title)`, `deleteConversation(id)`, `streamChatMessage(params)` (async generator of `StreamEvent`) | **real (Stage 5)** |
| Study tools | `generateSummary(docId, level)`, `getQuizzes(workspaceId?)`, `generateQuiz(params)`, `submitQuiz(quizId, answers)`, `getDecks(workspaceId?)`, `rateFlashcard(deckId, cardId, rating)`, `generateDeckFromDocument(docId, title)`, `getWeakTopics(workspaceId?)`, `getStudyPlan(workspaceId)` | mock (Stage 6) |
| Career | `analyzeSkillGap(resumeText, jdText)`, `rewriteBullet(bullet, mode)`, `getRoadmap()`, `getInterviewQuestions()`, `evaluateInterview(transcript, durationSeconds)` | mock (Stage 7) |
| Eval | `getRAGEvalMetrics()`, `getRAGEvalTestCases()`, `runEvaluationSuite()` | mock (Stage 8) |
| Memory | `getMemoryFacts(workspaceId?)`, `addMemoryFact(workspaceId, fact)`, `deleteMemoryFact(id)`, `togglePinMemoryFact(id)` | **real (Stage 5)** — only ever written from an explicit user action |

Not yet in `api` (backend exists in later stages; method added when wired):
`POST /mindmap/generate`, study sessions + `GET /dashboard/summary`,
workspace sharing, provider health panel beyond `getAIStatus`.

## Backend routes behind those methods

```
GET    /ai/status                          provider health + today's quota
POST   /ai/quick-ask                       SSE: token → done | error
GET    /documents?workspaceId=             newest first, mine only
GET    /workspaces/{id}/documents          workspace-scoped listing
GET    /documents/{id}
POST   /workspaces/{id}/documents          multipart file (201 DocumentItem)
POST   /workspaces/{id}/documents/link     { url, type: web | youtube }
DELETE /documents/{id}                     204; removes chunks + storage object
POST   /documents/{id}/reprocess           re-reads the stored source, re-runs
GET    /workspaces/{id}/conversations      pinned first, then recent; with messages
POST   /workspaces/{id}/conversations      { title, ... } → 201 Conversation
GET    /conversations/{id}
PATCH  /conversations/{id}                 rename / scope / level / language / model
DELETE /conversations/{id}                 messages cascade
POST   /chat/stream                        SSE: trace → retrieval → token* → citation → critic → done
GET    /workspaces/{id}/memory             pinned first, then newest
POST   /workspaces/{id}/memory             { fact }
POST   /memory/{id}/pin                    toggles isPinned
DELETE /memory/{id}
```

Upload/link/reprocess responses are serialised **before** the background
pipeline starts, so the returned item is `queued` with `progressPercent: 0`;
the Documents page follows `queued → parsing → chunking → embedding →
ready | error` by calling `pollDocumentsUntilSettled` (`src/lib/api/documents.ts`,
interval 1.5 s, aborted when nothing is in flight or the page unmounts) and
re-renders the list from each snapshot. `error` carries a safe user-facing
message — never a stack trace — and offers **Reprocess**
(`POST /documents/{id}/reprocess`). Upload failures mark that queue item
failed and continue with the rest of the batch.

Quota and validation failures (`429 quota_exceeded`, `413`, `415`, `409`,
`404`) arrive as the normal JSON envelope *before* any stream opens.

## SSE event shapes

### `POST /ai/quick-ask` (implemented)

| Event | Data |
|---|---|
| `token` | `{ text: string }` — append to the answer as it arrives |
| `done` | `{ provider, model, latencyMs, usage: { promptTokens, completionTokens, totalTokens } }` |
| `error` | `{ code, message }` — a provider failure *after* the 200; `streamQuickAsk` throws an `ApiError` carrying that code/message |

`quickAsk` resolves with the full concatenated answer. An `AbortError`
("Stop") propagates unwrapped so the UI can tell *stopped* from *failed*.

### `POST /chat/stream` (implemented)

The event sequence is exactly the one the demo mock produces, so the ChatPage
renders both modes with one code path (`applyStreamEvent` in
`src/lib/api/chat.ts`):

| Event | Data |
|---|---|
| `trace` | `AgentReasoningStep` — emitted as each stage finishes (Planner, Retriever, Critic). The Planner step records the real decisions (scope, language, level, memory, general-knowledge mode); it does not invent sub-queries. |
| `retrieval` | `RetrievalInspectionItem[]` — chunk id, document, page/timestamp, snippet, `bm25Score`, `vectorScore`, `fusedRank`, `rerankerScore`, `initialRank`, `finalRank` (null when that ranker did not run) |
| `token` | a **plain string** (`"Two-phase locking…"`) — appended to the answer; unlike quick-ask there is no `{text}` wrapper |
| `citation` | `Citation[]` built from chunk metadata (document id/name, page or timestamp, snippet, confidence). Markers that point at nothing are stripped from the answer and never become citation objects. |
| `critic` | `AgentReasoningStep` with `criticVerdict { passed, hallucinationDetected, unsupportedSentence?, note }` plus `confidence` (0–100) and `tier` (`high \| medium \| low`), and `isNotFound: true` when retrieval found nothing and the assistant abstained |
| `done` | `null` (the mock's shape; persistence happens server-side) |
| `error` | `{ code, message }` — a failure *after* the 200; `streamChatEvents` throws an `ApiError` carrying it |

Request body (`toChatBody`): `{ conversationId, query, explanationLevel,
answerLanguage, model, generalKnowledge }`. `generalKnowledge` is opt-in: with
it off, weak or empty retrieval makes the assistant answer
*"I couldn't find this in your documents."* (in the conversation's language)
instead of guessing; with it on, the answer starts with `General knowledge:`.

Quota and validation failures arrive before the stream as the normal JSON
envelope (429 `quota_exceeded` included — chat counts against the same daily
AI limit as Quick Ask).

## Demo mode

`VITE_USE_MOCK=true` keeps everything in-memory: mock session, no Supabase
calls, no network. `quickAsk` still streams in word-sized pieces and
`getAIStatus` returns data the Settings page labels **DEMO DATA**. This stays
working at every stage.
