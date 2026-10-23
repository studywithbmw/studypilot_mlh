import {
  DocumentItem,
  Workspace,
  Conversation,
  ChatMessage,
  Quiz,
  FlashcardDeck,
  WeakTopic,
  SkillGapAnalysis,
  BulletRewriteItem,
  RoadmapMilestone,
  MockInterviewQuestion,
  InterviewFeedback,
  MemoryFact,
  UserProfile,
  SummaryNote,
  StudyPlan,
  StudyTask,
  ExplanationLevel,
  AIModelId,
  SupportedLanguage,
  AIStatus,
  ExamReport,
  ExamReportSummary,
  ExamDocumentSelection,
  Room,
  RoomSummary,
} from '../../types';
import {
  MOCK_USER,
  MOCK_WORKSPACES,
  MOCK_DOCUMENTS,
  MOCK_CONVERSATIONS,
  MOCK_QUIZZES,
  MOCK_FLASHCARD_DECKS,
  MOCK_WEAK_TOPICS,
  MOCK_CAREER_ANALYSIS,
  MOCK_BULLET_REWRITES,
  MOCK_ROADMAP_MILESTONES,
  MOCK_INTERVIEW_QUESTIONS,
  MOCK_MEMORY_FACTS,
} from '../../mocks/seedData';
import { calculateSM2, SM2Rating } from '../sm2';

import { USE_MOCK, API_URL } from '../env';
import { ApiError, apiBlob, apiRequest, apiSSEStream, getAuthToken, parseSSEStream } from './http';
import { toUploadError } from './documents';
import { streamChatEvents, type ChatStreamParams, type StreamEvent } from './chat';
export type { StreamEvent } from './chat';

/**
 * Quick Ask options. `onToken` receives streamed deltas as they arrive so the
 * UI can render progressively; `signal` aborts the request ("Stop").
 */
export interface QuickAskOptions {
  level?: ExplanationLevel;
  language?: SupportedLanguage;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}

function parseSSEData<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Multipart upload with real progress.
 *
 * `fetch` cannot report upload progress, so this uses XMLHttpRequest for the
 * request body only; auth, the error envelope and 401 handling are unchanged.
 */
async function uploadDocumentRequest(
  workspaceId: string,
  file: File,
  onProgress?: (progress: number, status: string) => void,
): Promise<DocumentItem> {
  const url = `${API_URL}/workspaces/${encodeURIComponent(workspaceId)}/documents`;
  const token = await getAuthToken();

  return new Promise<DocumentItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(Math.min(percent, 99), percent >= 100 ? 'parsing' : 'uploading');
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.'));
    xhr.ontimeout = () =>
      reject(new ApiError(0, 'timeout', 'The upload took too long. Please try again.'));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));

    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100, 'ready');
        resolve(payload as DocumentItem);
        return;
      }
      // Envelope code/message/requestId are mapped by toUploadError (unit-tested).
      reject(toUploadError(xhr.status, payload, xhr.getResponseHeader('X-Request-ID')));
    };

    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}

/**
 * POST /ai/quick-ask and consume the SSE stream.
 *
 * Events: `token` {text} ... `done` {usage, provider, model} | `error` {code,
 * message}. Quota and validation failures arrive as a normal HTTP error
 * before the stream starts (apiSSEStream throws an ApiError with the right
 * status); provider failures mid-stream arrive as an `error` event.
 */
export async function streamQuickAsk(text: string, options: QuickAskOptions = {}): Promise<string> {
  const body: Record<string, unknown> = { text };
  if (options.level) body.explanationLevel = options.level;
  if (options.language) body.language = options.language;

  const stream = await apiSSEStream('/ai/quick-ask', {
    method: 'POST',
    body,
    signal: options.signal,
  });

  let answer = '';
  // An AbortError propagates unchanged so callers can tell "stopped" from
  // "failed" (it is not wrapped in an ApiError).
  for await (const message of parseSSEStream(stream)) {
    if (message.event === 'token') {
      const delta = parseSSEData<{ text?: string }>(message.data)?.text ?? '';
      if (delta) {
        answer += delta;
        options.onToken?.(delta);
      }
    } else if (message.event === 'error') {
      const payload = parseSSEData<{ code?: string; message?: string }>(message.data);
      throw new ApiError(
        0,
        payload?.code || 'upstream_error',
        payload?.message || 'The AI service is temporarily unavailable. Please try again.',
      );
    }
    // `done` carries usage/provider metadata; nothing more to render.
  }
  return answer;
}

/** Profile fields the backend accepts in PATCH /me (anything else is a 422). */
const PROFILE_PATCH_KEYS = [
  'name',
  'avatarUrl',
  'role',
  'goal',
  'subjects',
  'onboarded',
  'preferredLanguage',
  'defaultModel',
  'defaultExplanationLevel',
  'hybridSearchEnabled',
  'rerankerEnabled',
  'topK',
  'memoryEnabled',
] as const;

export function toProfilePatch(updates: Partial<UserProfile>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const src = updates as unknown as Record<string, unknown>;
  for (const key of PROFILE_PATCH_KEYS) {
    if (key in src && src[key] !== undefined) out[key] = src[key];
  }
  return out;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// In-memory mutable states for the mock session
let workspaces = [...MOCK_WORKSPACES];
let documents = [...MOCK_DOCUMENTS];
let conversations = [...MOCK_CONVERSATIONS];
let quizzes = [...MOCK_QUIZZES];
let decks = JSON.parse(JSON.stringify(MOCK_FLASHCARD_DECKS)) as FlashcardDeck[];
let weakTopics = [...MOCK_WEAK_TOPICS];
let memoryFacts = [...MOCK_MEMORY_FACTS];
let userProfile = { ...MOCK_USER };

// `StreamEvent` (and its mapping from the SSE stream) lives in ./chat so the
// real transport and this demo generator share one definition.

export interface MindMapTree {
  id?: string;
  documentId: string;
  documentName: string;
  root: MindMapBranch;
  createdAt?: string;
}
export interface MindMapBranch {
  label: string;
  summary: string;
  children: MindMapBranch[];
}
export interface DashboardData {
  quizScores: { label: string; score: number; completedAt: string }[];
  topicMastery: { topic: string; accuracy: number; attempts: number }[];
  weakTopics: WeakTopic[];
  dueFlashcards: number;
  todaysTasks: StudyTask[];
}

export const api = {
  // Auth
  async login(email: string): Promise<{ user: UserProfile; token: string }> {
    await delay(350);
    userProfile.email = email;
    return { user: userProfile, token: 'mock_jwt_token_sample' };
  },

  async signup(name: string, email: string): Promise<{ user: UserProfile; token: string }> {
    await delay(400);
    userProfile.name = name;
    userProfile.email = email;
    return { user: userProfile, token: 'mock_jwt_token_sample' };
  },

  // Real mode (Stage 2): GET/PATCH/DELETE /me and /workspaces hit FastAPI.
  // Everything below "Documents" is still mock data until its stage lands.
  async getProfile(): Promise<UserProfile> {
    if (!USE_MOCK) return apiRequest<UserProfile>('/me');
    await delay(150);
    return userProfile;
  },

  async updatePreferences(updates: Partial<UserProfile>): Promise<UserProfile> {
    if (!USE_MOCK) {
      return apiRequest<UserProfile>('/me', { method: 'PATCH', body: toProfilePatch(updates) });
    }
    await delay(200);
    userProfile = { ...userProfile, ...updates };
    return userProfile;
  },

  /** Download everything the server holds for the signed-in user (GDPR-style export). */
  async exportMyData(): Promise<Blob> {
    if (!USE_MOCK) return apiBlob('/me/export');
    await delay(200);
    return new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), demo: true, user: userProfile, workspaces }, null, 2)],
      { type: 'application/json' },
    );
  },

  /** Permanently delete the account and all of its data. */
  async deleteAccount(): Promise<void> {
    if (!USE_MOCK) {
      await apiRequest<void>('/me', { method: 'DELETE', body: { confirm: 'DELETE' } });
      return;
    }
    await delay(300);
  },

  // Workspaces
  async getWorkspaces(): Promise<Workspace[]> {
    if (!USE_MOCK) return apiRequest<Workspace[]>('/workspaces');
    await delay(200);
    return [...workspaces];
  },

  async createWorkspace(name: string, color: string, emoji: string): Promise<Workspace> {
    if (!USE_MOCK) {
      return apiRequest<Workspace>('/workspaces', { method: 'POST', body: { name, color, emoji } });
    }
    await delay(300);
    const ws: Workspace = {
      id: `ws_${Date.now()}`,
      name,
      color,
      emoji,
      documentCount: 0,
      deckCount: 0,
      quizCount: 0,
      createdAt: new Date().toISOString(),
    };
    workspaces = [ws, ...workspaces];
    return ws;
  },

  async updateWorkspace(
    id: string,
    patch: Partial<Pick<Workspace, 'name' | 'description' | 'color' | 'emoji' | 'isArchived'>>,
  ): Promise<Workspace> {
    if (!USE_MOCK) {
      return apiRequest<Workspace>(`/workspaces/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
    }
    await delay(200);
    const current = workspaces.find((w) => w.id === id);
    if (!current) throw new Error('Workspace not found');
    const updated = { ...current, ...patch };
    workspaces = workspaces.map((w) => (w.id === id ? updated : w));
    return updated;
  },

  async deleteWorkspace(id: string): Promise<void> {
    if (!USE_MOCK) {
      await apiRequest<void>(`/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return;
    }
    await delay(250);
    workspaces = workspaces.filter((w) => w.id !== id);
  },

  // Documents (Stage 4: real upload/link/list/delete/reprocess in real mode)
  async getDocuments(workspaceId?: string): Promise<DocumentItem[]> {
    if (!USE_MOCK) {
      const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      return apiRequest<DocumentItem[]>(`/documents${query}`);
    }
    await delay(250);
    if (!workspaceId) return [...documents];
    return documents.filter((d) => d.workspaceId === workspaceId);
  },

  async uploadDocument(
    workspaceId: string,
    file: File,
    onProgress?: (progress: number, status: string) => void
  ): Promise<DocumentItem> {
    if (!USE_MOCK) {
      return uploadDocumentRequest(workspaceId, file, onProgress);
    }
    const id = `doc_${Date.now()}`;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const docType = (ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'pptx' ? 'pptx' : 'txt') as DocumentItem['type'];

    const newDoc: DocumentItem = {
      id,
      workspaceId,
      name: file.name,
      type: docType,
      sizeBytes: file.size,
      pageCount: Math.max(1, Math.round(file.size / 45000)),
      chunkCount: Math.max(4, Math.round(file.size / 20000)),
      status: 'queued',
      progressPercent: 10,
      createdAt: new Date().toISOString(),
      contentSample: `Parsed content from uploaded document: ${file.name}. Contains syllabus, lecture topics, and review notes.`,
    };

    documents = [newDoc, ...documents];

    // Simulate animated ingestion pipeline
    if (onProgress) {
      setTimeout(() => onProgress(25, 'parsing'), 400);
      setTimeout(() => onProgress(60, 'chunking'), 900);
      setTimeout(() => onProgress(85, 'embedding'), 1400);
      setTimeout(() => {
        newDoc.status = 'ready';
        newDoc.progressPercent = 100;
        onProgress(100, 'ready');
      }, 1900);
    } else {
      setTimeout(() => {
        newDoc.status = 'ready';
        newDoc.progressPercent = 100;
      }, 1500);
    }

    return newDoc;
  },

  async addLinkDocument(workspaceId: string, url: string, type: 'web' | 'youtube'): Promise<DocumentItem> {
    if (!USE_MOCK) {
      return apiRequest<DocumentItem>(`/workspaces/${encodeURIComponent(workspaceId)}/documents/link`, {
        method: 'POST',
        body: { url, type },
      });
    }
    await delay(500);
    const isYt = type === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be');
    const newDoc: DocumentItem = {
      id: `doc_link_${Date.now()}`,
      workspaceId,
      name: isYt ? 'YouTube Lecture: System Design Deep Dive' : 'Web Resource: Distributed Algorithms Spec',
      type: isYt ? 'youtube' : 'web',
      sizeBytes: isYt ? 950000 : 250000,
      durationSeconds: isYt ? 1800 : undefined,
      chunkCount: isYt ? 42 : 18,
      status: 'ready',
      progressPercent: 100,
      url,
      thumbnailUrl: isYt ? 'https://img.youtube.com/vi/vYp4LYbnnW8/hqdefault.jpg' : undefined,
      createdAt: new Date().toISOString(),
      contentSample: `[00:00] Introduction to scalable design.\n[04:20] Trade-offs in consensus.\n[14:10] Database sharding and partition schemes.`,
    };
    documents = [newDoc, ...documents];
    return newDoc;
  },

  async deleteDocument(id: string): Promise<void> {
    if (!USE_MOCK) {
      await apiRequest<void>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return;
    }
    await delay(200);
    documents = documents.filter((d) => d.id !== id);
  },

  /** Re-run the ingestion pipeline for a failed document. */
  async reprocessDocument(id: string): Promise<DocumentItem> {
    if (!USE_MOCK) {
      return apiRequest<DocumentItem>(`/documents/${encodeURIComponent(id)}/reprocess`, {
        method: 'POST',
      });
    }
    await delay(300);
    const doc = documents.find((d) => d.id === id);
    if (!doc) throw new Error('Document not found');
    doc.status = 'queued';
    doc.progressPercent = 0;
    delete doc.error;
    setTimeout(() => {
      doc.status = 'ready';
      doc.progressPercent = 100;
    }, 1200);
    return doc;
  },

  // Conversations & RAG Streaming
  // Real mode: /workspaces/{id}/conversations and POST /chat/stream.
  async getConversations(workspaceId?: string): Promise<Conversation[]> {
    if (!USE_MOCK) {
      if (!workspaceId) return [];
      return apiRequest<Conversation[]>(`/workspaces/${workspaceId}/conversations`);
    }
    await delay(200);
    if (!workspaceId) return [...conversations];
    return conversations.filter((c) => c.workspaceId === workspaceId);
  },

  async createConversation(workspaceId: string, title: string): Promise<Conversation> {
    if (!USE_MOCK) {
      return apiRequest<Conversation>(`/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
        body: { title },
      });
    }
    const conv: Conversation = {
      id: `conv_${Date.now()}`,
      workspaceId,
      title,
      documentScope: 'all',
      explanationLevel: userProfile.defaultExplanationLevel,
      answerLanguage: userProfile.preferredLanguage,
      model: userProfile.defaultModel,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    conversations = [conv, ...conversations];
    return conv;
  },

  async *streamChatMessage(params: {
    conversationId: string;
    query: string;
    workspaceId: string;
    level: ExplanationLevel;
    language: 'en' | 'ta' | 'hi';
    model: AIModelId;
    /** Real mode: cancels the request (the server drops its LLM call). */
    signal?: AbortSignal;
    /** Real mode: allow a labelled general-knowledge answer as a fallback. */
    generalKnowledge?: boolean;
  }): AsyncGenerator<StreamEvent, void, unknown> {
    if (!USE_MOCK) {
      yield* streamChatEvents(params as ChatStreamParams);
      return;
    }
    // 1. Planner Trace
    yield {
      type: 'trace',
      data: {
        agent: 'Planner',
        durationMs: 140,
        status: 'completed',
        outputSnippet: `Decomposed prompt: "${params.query}" into semantic sub-queries. Scope: Workspace documents.`,
        subQueries: [`${params.query} fundamental concepts`, `${params.query} implementation trade-offs`],
      },
    };
    await delay(200);

    // 2. Retrieval Inspector Trace
    yield {
      type: 'retrieval',
      data: [
        {
          chunkId: 'chunk_ret_1',
          docName: 'DBMS Notes.pdf',
          pageOrTime: 'p. 14',
          snippet: 'Two-phase locking and transaction isolation levels guarantee consistency.',
          bm25Score: 9.24,
          vectorScore: 0.91,
          fusedRank: 1,
          rerankerScore: 0.97,
          initialRank: 2,
          finalRank: 1,
        },
        {
          chunkId: 'chunk_ret_2',
          docName: 'Operating Systems.pdf',
          pageOrTime: 'p. 19',
          snippet: 'Page fault handling and TLB address translation mechanisms in virtual memory.',
          bm25Score: 7.91,
          vectorScore: 0.86,
          fusedRank: 2,
          rerankerScore: 0.92,
          initialRank: 1,
          finalRank: 2,
        },
      ],
    };
    await delay(200);

    // 3. Retriever Agent Trace
    yield {
      type: 'trace',
      data: {
        agent: 'Retriever',
        durationMs: 210,
        status: 'completed',
        outputSnippet: 'Hybrid search retrieved top 4 candidate passages, cross-encoder reranked to top-2.',
      },
    };
    await delay(150);

    // 4. Token Streaming
    let responseText = '';
    if (params.language === 'ta') {
      responseText = `உங்கள் ஆவணங்களின்படி, **${params.query}** பற்றிய விரிவான விளக்கம்:\n\n1. **அடிப்படைக் கோட்பாடு [1]**:\n- தரவுத்தள அல்லது இயக்க முறைமையில் இது மிக முக்கியமான பங்கு வகிக்கிறது.\n- பாதுகாப்பு மற்றும் செயல்திறனை சமநிலைப்படுத்துகிறது.\n\n2. **நடைமுறை பயன்கள் [2]**:\n- கணினி செயலிழப்பிலிருந்து பாதுகாத்தல் மற்றும் வேகமான மீட்டெடுப்பு.\n\n| பண்பு | விளக்கம் |\n| :--- | :--- |\n| வேகம் | உகந்த செயல்திறன் |\n| நம்பகத்தன்மை | முழுமையான தரவு பாதுகாப்பு |`;
    } else if (params.language === 'hi') {
      responseText = `आपके दस्तावेज़ों के आधार पर, **${params.query}** का विस्तृत विश्लेषण:\n\n1. **मुख्य सिद्धांत [1]**:\n- यह सिस्टम की स्थिरता और लेन-देन की सटीकता को बनाए रखता है।\n- समवर्ती संचालन में टकराव को रोकता है।\n\n2. **व्यावहारिक अनुप्रयोग [2]**:\n- डेटा अखंडता और त्वरित रिकवरी सुनिश्चित करता है।\n\n| विशेषता | विवरण |\n| :--- | :--- |\n| गति | उच्च प्रदर्शन |\n| विश्वसनीयता | पूर्ण डेटा सुरक्षा |`;
    } else {
      if (params.level === 'eli5') {
        responseText = `Imagine you and your friends are sharing a toy box [1]. To avoid fighting, only one kid can play with a toy at a time, and you promise to put it right back safely [2]. That is exactly what this mechanism does in computers!`;
      } else if (params.level === 'expert') {
        responseText = `Rigorous architectural examination of **${params.query}** [1]:\n\n- **Invariants**: Guarantees strict linearizability under asynchronous failure conditions.\n- **Algorithmic Bounds**: Worst-case lock contention latency scales as $\\mathcal{O}(N)$ where $N$ represents concurrent transaction threads [2].\n- **Recovery Mechanics**: Adheres strictly to ARIES write-ahead logging with idempotent REDO passes during warm restarts.`;
      } else {
        responseText = `Based on your course materials and lecture notes on **${params.query}** [1]:\n\n1. **Core Mechanism**:\n   - Operates to guarantee consistent execution without data corruption or cascading aborts.\n   - Enforces serializability across concurrent worker routines.\n\n2. **Key Trade-offs [2]**:\n   - **Throughput vs Latency**: Increasing lock granularity reduces overhead but increases wait times.\n   - **Deadlock Potential**: Cycles in the dependency graph require victim resolution algorithms.\n\n| Factor | Impact | Mitigation |\n| :--- | :--- | :--- |\n| **Concurrency** | High | Granular locks |\n| **Isolation** | Strict | Two-Phase Locking |`;
      }
    }

    const words = responseText.split(' ');
    for (const word of words) {
      yield { type: 'token', data: word + ' ' };
      await delay(25);
    }

    // 5. Citations
    yield {
      type: 'citation',
      data: [
        {
          id: `cit_${Date.now()}_1`,
          documentId: 'doc_dbms',
          documentName: 'DBMS Notes - Transactions & Concurrency.pdf',
          pageNumber: 14,
          snippet: 'Two-phase locking protocol ensures serializable schedules and prevents dirty read phenomena.',
          confidence: 0.96,
        },
        {
          id: `cit_${Date.now()}_2`,
          documentId: 'doc_os',
          documentName: 'Operating Systems - Memory & Paging.pdf',
          pageNumber: 8,
          snippet: 'Page fault traps decouple logical addresses from physical memory frames with verified protection bits.',
          confidence: 0.93,
        },
      ],
    };

    // 6. Critic Trace
    yield {
      type: 'critic',
      data: {
        agent: 'Critic',
        durationMs: 90,
        status: 'completed',
        outputSnippet: 'Grounding verified: 0 hallucinations detected across all generated statements.',
        criticVerdict: {
          passed: true,
          hallucinationDetected: false,
          note: 'Passed strict fact verification against cited document snippets.',
        },
      },
    };

    yield { type: 'done', data: null };
  },

  async quickAsk(text: string, options: QuickAskOptions = {}): Promise<string> {
    if (!USE_MOCK) return streamQuickAsk(text, options);
    await delay(600);
    if (options.onToken) {
      // Demo mode: still deliver the answer in token-sized pieces.
      for (const word of `Quick Answer: "${text}" is a foundational principle in system design.`.split(' ')) {
        options.onToken(`${word} `);
        await delay(60);
      }
    }
    return `Quick Answer: "${text}" is a foundational principle in system design. It ensures high availability, strict consistency, and fault tolerance when partitioned across modern cloud infrastructure.`;
  },

  // AI provider status (real mode: GET /ai/status).
  async getAIStatus(): Promise<AIStatus> {
    if (!USE_MOCK) return apiRequest<AIStatus>('/ai/status');
    await delay(200);
    // Demo mode only: the Settings page labels this card "DEMO DATA".
    return {
      providers: [
        { provider: 'groq', configured: true, status: 'ok', model: 'demo', breakerState: 'closed' },
        { provider: 'gemini', configured: true, status: 'ok', model: 'demo', breakerState: 'closed' },
      ],
      quota: {
        day: new Date().toISOString().slice(0, 10),
        used: 0,
        limit: 100,
        remaining: 100,
      },
    };
  },

  // Summaries
  async generateSummary(docId: string, level: 'short' | 'detailed' | 'bullet' | 'terms'): Promise<SummaryNote> {
    if (!USE_MOCK) {
      return apiRequest<SummaryNote>(`/documents/${encodeURIComponent(docId)}/summary`, { method: 'POST', body: { level } });
    }
    await delay(700);
    const doc = documents.find((d) => d.id === docId) || documents[0];
    const contents: Record<string, string> = {
      short: `Executive Abstract: ${doc.name} systematically covers fundamental concepts including serializability, deadlock management, and memory virtualization. It bridges theoretical algorithms with production-grade engineering trade-offs.`,
      detailed: `Comprehensive Synthesis: ${doc.name}\n\n1. Foundations: Explores transaction isolation semantics, ACID guarantees, and write-ahead logging (WAL).\n2. Concurrency Protocols: Compares Strict 2PL with Optimistic Concurrency Control (OCC) and timestamp ordering.\n3. Failure Recovery: Covers checkpointing, undo/redo logs, and distributed two-phase commit coordinators.\n4. Practical Recommendations: Emphasizes monitoring wait-for graphs and tuning lock granularity.`,
      bullet: `Structured Study Notes:\n• ACID: Atomicity, Consistency, Isolation, Durability\n• 2PL Rule: No locks can be acquired after any lock has been released\n• Strict 2PL: All exclusive write locks must be held until explicit commit\n• Belady's Anomaly: FIFO replacement can increase page faults when physical frames increase\n• Raft: Randomized election timeouts (150-300ms) prevent candidate split votes`,
      terms: `Key Terms Glossary:\n• Two-Phase Locking (2PL): Protocol guaranteeing conflict serializability.\n• Translation Lookaside Buffer (TLB): High-speed hardware cache for virtual-to-physical address mappings.\n• Wait-For Graph (WFG): Directed graph representing resource dependency cycles for deadlock detection.\n• Raft Quorum: Strict majority requirement $(N/2 + 1)$ for cluster state consensus.`,
    };

    return {
      id: `sum_${Date.now()}`,
      workspaceId: doc.workspaceId,
      documentId: doc.id,
      title: `${doc.name} - ${level.toUpperCase()} Summary`,
      level,
      content: contents[level] || contents.detailed,
      citations: [
        {
          id: 'cit_sum_1',
          documentId: doc.id,
          documentName: doc.name,
          pageNumber: 14,
          snippet: 'Summary grounded in Chapter 7 and Chapter 9 principles.',
          confidence: 0.95,
        },
      ],
      createdAt: new Date().toISOString(),
    };
  },

  // Quizzes
  async getQuizzes(workspaceId?: string): Promise<Quiz[]> {
    if (!USE_MOCK) {
      if (!workspaceId) return [];
      return apiRequest<Quiz[]>(`/workspaces/${encodeURIComponent(workspaceId)}/quizzes`);
    }
    await delay(200);
    if (!workspaceId) return [...quizzes];
    return quizzes.filter((q) => q.workspaceId === workspaceId);
  },

  async generateQuiz(params: {
    workspaceId: string;
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    count: number;
    timedMinutes?: number;
  }): Promise<Quiz> {
    if (!USE_MOCK) {
      return apiRequest<Quiz>('/quizzes', { method: 'POST', body: params });
    }
    await delay(800);
    const newQuiz: Quiz = {
      id: `quiz_${Date.now()}`,
      workspaceId: params.workspaceId,
      title: `${params.topic} Mastery Quiz`,
      topic: params.topic,
      difficulty: params.difficulty,
      timedMinutes: params.timedMinutes || 10,
      createdAt: new Date().toISOString(),
      questions: MOCK_QUIZZES[0].questions.slice(0, Math.min(params.count, MOCK_QUIZZES[0].questions.length)),
    };
    quizzes = [newQuiz, ...quizzes];
    return newQuiz;
  },

  async submitQuiz(
    quizId: string,
    answers: { questionId: string; answer: string | number }[]
  ): Promise<{ scorePercent: number; attempts: Array<{ questionId: string; isCorrect: boolean; aiFeedback?: string }> }> {
    if (!USE_MOCK) {
      return apiRequest<{ scorePercent: number; attempts: Array<{ questionId: string; isCorrect: boolean; aiFeedback?: string }> }>(
        `/quizzes/${encodeURIComponent(quizId)}/submit`,
        { method: 'POST', body: { answers } },
      );
    }
    await delay(500);
    const quiz = quizzes.find((q) => q.id === quizId) || quizzes[0];
    let correctCount = 0;
    const attempts = quiz.questions.map((q) => {
      const userAns = answers.find((a) => a.questionId === q.id)?.answer;
      const isCorrect = userAns !== undefined && String(userAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase();
      if (isCorrect) correctCount++;
      return {
        questionId: q.id,
        userAnswer: userAns ?? '',
        isCorrect,
        aiGradedScore: isCorrect ? 100 : 30,
        aiFeedback: isCorrect
          ? 'Accurate recall with appropriate conceptual keywords.'
          : `Review ${q.topic}: ${q.explanation}`,
      };
    });

    const scorePercent = Math.round((correctCount / quiz.questions.length) * 100);
    quiz.scorePercent = scorePercent;
    quiz.completedAt = new Date().toISOString();

    return { scorePercent, attempts };
  },

  // Flashcards
  async getDecks(workspaceId?: string): Promise<FlashcardDeck[]> {
    if (!USE_MOCK) {
      if (!workspaceId) return [];
      return apiRequest<FlashcardDeck[]>(`/workspaces/${encodeURIComponent(workspaceId)}/decks`);
    }
    await delay(200);
    if (!workspaceId) return [...decks];
    return decks.filter((d) => d.workspaceId === workspaceId);
  },

  async rateFlashcard(deckId: string, cardId: string, rating: SM2Rating): Promise<FlashcardDeck> {
    if (!USE_MOCK) {
      return apiRequest<FlashcardDeck>(
        `/decks/${encodeURIComponent(deckId)}/cards/${encodeURIComponent(cardId)}/rate`,
        { method: 'POST', body: { rating } },
      );
    }
    await delay(150);
    const deck = decks.find((d) => d.id === deckId);
    if (deck) {
      const card = deck.cards.find((c) => c.id === cardId);
      if (card) {
        const nextSM2 = calculateSM2(card.sm2, rating);
        card.sm2 = {
          repetition: nextSM2.repetition,
          interval: nextSM2.interval,
          easeFactor: nextSM2.easeFactor,
        };
        card.dueDate = nextSM2.dueDate;
        deck.dueCount = deck.cards.filter((c) => new Date(c.dueDate) <= new Date()).length;
      }
    }
    return deck!;
  },

  async generateDeckFromDocument(docId: string, title: string, workspaceId = ''): Promise<FlashcardDeck> {
    if (!USE_MOCK) {
      return apiRequest<FlashcardDeck>('/decks', {
        method: 'POST',
        body: { workspaceId, documentId: docId || undefined, topic: title },
      });
    }
    await delay(700);
    const doc = documents.find((d) => d.id === docId) || documents[0];
    const newDeck: FlashcardDeck = {
      id: `deck_${Date.now()}`,
      workspaceId: doc.workspaceId,
      title: title || `${doc.name} Flashcard Deck`,
      description: `Automated spaced repetition cards generated from ${doc.name}`,
      cardCount: 6,
      dueCount: 6,
      createdAt: new Date().toISOString(),
      cards: [
        {
          id: `c_${Date.now()}_1`,
          deckId: `deck_${Date.now()}`,
          front: 'What does ACID stand for in database management systems?',
          back: 'Atomicity, Consistency, Isolation, and Durability.',
          sm2: { repetition: 0, interval: 1, easeFactor: 2.5 },
          dueDate: new Date().toISOString(),
          topic: 'Basics',
        },
        {
          id: `c_${Date.now()}_2`,
          deckId: `deck_${Date.now()}`,
          front: 'What is the primary guarantee of Strict Two-Phase Locking?',
          back: 'Prevents cascading aborts and guarantees conflict serializability by keeping exclusive locks until commit.',
          sm2: { repetition: 0, interval: 1, easeFactor: 2.5 },
          dueDate: new Date().toISOString(),
          topic: 'Concurrency',
        },
        {
          id: `c_${Date.now()}_3`,
          deckId: `deck_${Date.now()}`,
          front: 'Define Belady\'s Anomaly in operating systems.',
          back: 'A phenomenon where increasing physical frame count leads to an increase in page faults, observed in FIFO.',
          sm2: { repetition: 0, interval: 1, easeFactor: 2.5 },
          dueDate: new Date().toISOString(),
          topic: 'Memory',
        },
      ],
    };
    decks = [newDeck, ...decks];
    return newDeck;
  },

  // Weak Topics
  async getWeakTopics(workspaceId?: string): Promise<WeakTopic[]> {
    if (!USE_MOCK) {
      if (!workspaceId) return [];
      return apiRequest<WeakTopic[]>(`/workspaces/${encodeURIComponent(workspaceId)}/weak-topics`);
    }
    await delay(200);
    if (!workspaceId) return [...weakTopics];
    return weakTopics.filter((w) => w.workspaceId === workspaceId);
  },

  // Career
  async analyzeSkillGap(resumeText: string, jdText: string): Promise<SkillGapAnalysis> {
    if (!USE_MOCK) {
      return apiRequest<SkillGapAnalysis>('/career/skill-gap', { method: 'POST', body: { resumeText, jdText } });
    }
    await delay(1000);
    return {
      ...MOCK_CAREER_ANALYSIS,
      id: `analysis_${Date.now()}`,
    };
  },

  async rewriteBullet(bullet: string, mode: 'quantified' | 'concise'): Promise<BulletRewriteItem> {
    if (!USE_MOCK) {
      return apiRequest<BulletRewriteItem>('/career/rewrite-bullet', { method: 'POST', body: { bullet, mode } });
    }
    await delay(600);
    if (mode === 'concise') {
      return {
        id: `br_${Date.now()}`,
        original: bullet,
        improved: `Engineered high-concurrency microservices, slashing latency by 45% across 2M daily API calls.`,
        diffSummary: 'Removed filler prose, prioritized active metrics',
        quantificationScore: 96,
        metricAdded: '45% latency reduction, 2M calls',
      };
    }
    return {
      id: `br_${Date.now()}`,
      original: bullet,
      improved: `Optimized distributed data pipelines using asynchronous Kafka batching, accelerating throughput by 3.2x while saving $14,000/mo in infrastructure costs.`,
      diffSummary: 'Added quantified multiplier (3.2x) and exact cost reduction ($14k/mo)',
      quantificationScore: 98,
      metricAdded: '3.2x throughput, $14,000/mo cost saved',
    };
  },

  async getRoadmap(resumeText = '', jdText = ''): Promise<RoadmapMilestone[]> {
    if (!USE_MOCK) {
      return apiRequest<RoadmapMilestone[]>('/career/roadmap', { method: 'POST', body: { resumeText, jdText } });
    }
    await delay(200);
    return [...MOCK_ROADMAP_MILESTONES];
  },

  async getInterviewQuestions(resumeText = '', jdText = ''): Promise<MockInterviewQuestion[]> {
    if (!USE_MOCK) {
      return apiRequest<MockInterviewQuestion[]>('/career/interview-questions', { method: 'POST', body: { resumeText, jdText } });
    }
    await delay(200);
    return [...MOCK_INTERVIEW_QUESTIONS];
  },

  async evaluateInterview(transcript: string, durationSeconds: number, question = ''): Promise<InterviewFeedback> {
    if (!USE_MOCK) {
      return apiRequest<InterviewFeedback>('/career/interview-evaluate', {
        method: 'POST',
        body: { question: question || 'Interview question', transcript, durationSeconds },
      });
    }
    await delay(900);
    const words = transcript.trim().split(/\s+/).filter(Boolean);
    const wpm = durationSeconds > 0 ? Math.round((words.length / durationSeconds) * 60) : 130;

    // Detect fillers
    const fillers = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'sort of'];
    const lower = transcript.toLowerCase();
    const detectedFillers: string[] = [];
    let count = 0;
    fillers.forEach((f) => {
      const occurrences = (lower.match(new RegExp(`\\b${f}\\b`, 'g')) || []).length;
      if (occurrences > 0) {
        count += occurrences;
        detectedFillers.push(`${f} (${occurrences}x)`);
      }
    });

    return {
      rubric: {
        clarity: Math.min(95, Math.max(70, 85 - count * 3)),
        depth: 90,
        structure: 88,
        confidence: 86,
      },
      fillerCount: count,
      fillerWords: detectedFillers.length ? detectedFillers : ['None detected! Excellent fluency.'],
      speakingPaceWpm: wpm || 135,
      strengths: [
        'Structured response following the STAR framework (Situation, Task, Action, Result).',
        'Directly incorporated technical vocabulary matching the job requirements.',
        'Steady vocal cadence with well-timed natural pauses.',
      ],
      improvements: [
        count > 2 ? 'Reduce filler pauses ("um", "like") during conceptual transitions.' : 'Maintain current crisp pacing.',
        'Add one concrete operational metric (e.g., latency reduction or scale numbers).',
      ],
      modelAnswer: `In distributed environments, maintaining ACID guarantees requires segregating single-node serializability (via Strict 2PL) from network consensus. For cross-service coordination, I prefer the Saga pattern with idempotent compensating transactions over blocking 2PC to avoid coordinator deadlock and network partition latency.`,
    };
  },

  // Study Plan
  async getStudyPlan(workspaceId: string): Promise<StudyPlan | null> {
    if (!USE_MOCK) {
      return apiRequest<StudyPlan | null>(`/workspaces/${encodeURIComponent(workspaceId)}/study-plan`);
    }
    await delay(300);
    return {
      id: `plan_${workspaceId}`,
      workspaceId,
      title: 'Target Exam Readiness Sprint',
      targetExamDate: '2026-11-20',
      dailyHours: 3,
      weakTopicPriority: true,
      completionRate: 42,
      createdAt: '2026-10-01T08:00:00Z',
      tasks: [
        {
          id: 'task_1',
          planId: `plan_${workspaceId}`,
          dayIndex: 1,
          date: '2026-10-10',
          title: 'Review Strict 2PL & Deadlock cycle graphs',
          type: 'read',
          durationMinutes: 45,
          isCompleted: true,
          topic: 'DBMS Concurrency',
        },
        {
          id: 'task_2',
          planId: `plan_${workspaceId}`,
          dayIndex: 1,
          date: '2026-10-10',
          title: 'Practice 15 Concurrency & Lock MCQs',
          type: 'quiz',
          durationMinutes: 30,
          isCompleted: true,
          topic: 'DBMS Concurrency',
        },
        {
          id: 'task_3',
          planId: `plan_${workspaceId}`,
          dayIndex: 2,
          date: '2026-10-11',
          title: 'Complete 6 Due Flashcards in SM-2 Spaced Repetition',
          type: 'flashcards',
          durationMinutes: 20,
          isCompleted: false,
          topic: 'Spaced Repetition',
        },
        {
          id: 'task_4',
          planId: `plan_${workspaceId}`,
          dayIndex: 2,
          date: '2026-10-11',
          title: 'Deep dive into Belady\'s Anomaly in Operating Systems',
          type: 'revise',
          durationMinutes: 40,
          isCompleted: false,
          topic: 'Operating Systems',
        },
        {
          id: 'task_5',
          planId: `plan_${workspaceId}`,
          dayIndex: 3,
          date: '2026-10-12',
          title: 'Watch Raft Consensus lecture & extract notes',
          type: 'read',
          durationMinutes: 45,
          isCompleted: false,
          topic: 'Distributed Systems',
        },
      ],
    };
  },

  // ---- Real-only study features (no mock equivalent) ----
  async generateMindMap(docId: string): Promise<MindMapTree> {
    return apiRequest<MindMapTree>(`/documents/${encodeURIComponent(docId)}/mindmap`, { method: 'POST' });
  },

  /** Previously generated mind maps (saved on the server). */
  async getSavedMindMaps(workspaceId: string): Promise<MindMapTree[]> {
    if (!workspaceId) return [];
    return apiRequest<MindMapTree[]>(
      `/workspaces/${encodeURIComponent(workspaceId)}/saved-notes?kind=mindmap`,
    );
  },

  /** Previously generated summaries (saved on the server). */
  async getSavedSummaries(workspaceId: string): Promise<SummaryNote[]> {
    if (!USE_MOCK) {
      if (!workspaceId) return [];
      return apiRequest<SummaryNote[]>(
        `/workspaces/${encodeURIComponent(workspaceId)}/saved-notes?kind=summary`,
      );
    }
    return [];
  },

  /** Delete a saved summary or mind map. */
  async deleteSavedNote(id: string): Promise<void> {
    if (USE_MOCK) return;
    await apiRequest<void>(`/saved-notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async deleteQuiz(id: string): Promise<void> {
    if (!USE_MOCK) {
      await apiRequest<void>(`/quizzes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return;
    }
    quizzes = quizzes.filter((q) => q.id !== id);
  },

  async deleteDeck(id: string): Promise<void> {
    if (!USE_MOCK) {
      await apiRequest<void>(`/decks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return;
    }
    decks = decks.filter((d) => d.id !== id);
  },

  async getDashboard(workspaceId: string): Promise<DashboardData> {
    return apiRequest<DashboardData>(`/workspaces/${encodeURIComponent(workspaceId)}/dashboard`);
  },

  async createStudyPlan(
    workspaceId: string,
    input: { targetExamDate: string; dailyHours: number; weakTopicPriority: boolean },
  ): Promise<StudyPlan> {
    return apiRequest<StudyPlan>(`/workspaces/${encodeURIComponent(workspaceId)}/study-plan`, { method: 'POST', body: input });
  },

  async setStudyTask(workspaceId: string, taskId: string, isCompleted: boolean): Promise<StudyPlan> {
    return apiRequest<StudyPlan>(
      `/workspaces/${encodeURIComponent(workspaceId)}/study-plan/tasks/${encodeURIComponent(taskId)}`,
      { method: 'PATCH', body: { isCompleted } },
    );
  },

  async rescheduleStudyPlan(workspaceId: string): Promise<StudyPlan> {
    return apiRequest<StudyPlan>(`/workspaces/${encodeURIComponent(workspaceId)}/study-plan/reschedule`, { method: 'POST' });
  },

  async addFlashcard(deckId: string, front: string, back: string): Promise<FlashcardDeck> {
    return apiRequest<FlashcardDeck>(`/decks/${encodeURIComponent(deckId)}/cards`, { method: 'POST', body: { front, back } });
  },

  async deckFromQuizMistakes(quizId: string): Promise<FlashcardDeck> {
    return apiRequest<FlashcardDeck>(`/quizzes/${encodeURIComponent(quizId)}/flashcards`, { method: 'POST' });
  },

  // Memory (real mode: /workspaces/{id}/memory and /memory/{id}). Facts are
  // only ever written from an explicit user action — never extracted.
  async getMemoryFacts(workspaceId?: string): Promise<MemoryFact[]> {
    if (!USE_MOCK) {
      if (!workspaceId) return [];
      return apiRequest<MemoryFact[]>(`/workspaces/${workspaceId}/memory`);
    }
    await delay(200);
    if (!workspaceId) return [...memoryFacts];
    return memoryFacts.filter((m) => m.workspaceId === workspaceId);
  },

  async addMemoryFact(workspaceId: string, fact: string): Promise<MemoryFact> {
    if (!USE_MOCK) {
      return apiRequest<MemoryFact>(`/workspaces/${workspaceId}/memory`, {
        method: 'POST',
        body: { fact },
      });
    }
    await delay(200);
    const newFact: MemoryFact = {
      id: `mem_${Date.now()}`,
      workspaceId,
      fact,
      isPinned: false,
      createdAt: new Date().toISOString(),
    };
    memoryFacts = [newFact, ...memoryFacts];
    return newFact;
  },

  async deleteMemoryFact(id: string): Promise<void> {
    if (!USE_MOCK) {
      await apiRequest<void>(`/memory/${id}`, { method: 'DELETE' });
      return;
    }
    await delay(150);
    memoryFacts = memoryFacts.filter((m) => m.id !== id);
  },

  async togglePinMemoryFact(id: string): Promise<void> {
    if (!USE_MOCK) {
      await apiRequest<MemoryFact>(`/memory/${id}/pin`, { method: 'POST' });
      return;
    }
    const fact = memoryFacts.find((m) => m.id === id);
    if (fact) {
      fact.isPinned = !fact.isPinned;
    }
  },

  // Conversation management (rename/delete) — real mode only surface.
  async renameConversation(id: string, title: string): Promise<Conversation> {
    if (!USE_MOCK) {
      return apiRequest<Conversation>(`/conversations/${id}`, {
        method: 'PATCH',
        body: { title },
      });
    }
    const conversation = conversations.find((c) => c.id === id);
    if (conversation) conversation.title = title;
    return conversation as Conversation;
  },

  /** Which documents this conversation may answer from: 'all' or a list of document ids. */
  async setConversationScope(id: string, scope: 'all' | string[]): Promise<Conversation> {
    if (!USE_MOCK) {
      return apiRequest<Conversation>(`/conversations/${id}`, {
        method: 'PATCH',
        body: { documentScope: scope },
      });
    }
    const conversation = conversations.find((c) => c.id === id);
    if (conversation) conversation.documentScope = scope;
    return conversation as Conversation;
  },

  async deleteConversation(id: string): Promise<void> {
    if (!USE_MOCK) {
      await apiRequest<void>(`/conversations/${id}`, { method: 'DELETE' });
      return;
    }
    conversations = conversations.filter((c) => c.id !== id);
  },

  // Exam Predictor (real mode only: the analysis runs on the backend).
  async analyzeExam(
    workspaceId: string,
    documents: ExamDocumentSelection[],
    title = '',
  ): Promise<ExamReport> {
    return apiRequest<ExamReport>(`/workspaces/${encodeURIComponent(workspaceId)}/exam/analyze`, {
      method: 'POST',
      body: { documents, title },
    });
  },

  async getExamReport(reportId: string): Promise<ExamReport> {
    return apiRequest<ExamReport>(`/exam/reports/${encodeURIComponent(reportId)}`);
  },

  async getExamReports(workspaceId: string): Promise<ExamReportSummary[]> {
    if (!workspaceId) return [];
    return apiRequest<ExamReportSummary[]>(`/workspaces/${encodeURIComponent(workspaceId)}/exam/reports`);
  },

  /** Seed three built-in papers + a syllabus so the flow can be demoed without uploads. */
  async seedExamDemo(workspaceId: string): Promise<ExamReport> {
    return apiRequest<ExamReport>(`/workspaces/${encodeURIComponent(workspaceId)}/exam/demo`, {
      method: 'POST',
    });
  },

  // Study Rooms (real-time; these need the backend even in demo mode).
  async getRooms(): Promise<RoomSummary[]> {
    return apiRequest<RoomSummary[]>('/rooms');
  },

  async createRoom(name: string, maxMembers = 8): Promise<Room> {
    return apiRequest<Room>('/rooms', { method: 'POST', body: { name, maxMembers } });
  },

  async joinRoom(code: string): Promise<Room> {
    return apiRequest<Room>('/rooms/join', { method: 'POST', body: { code } });
  },

  async getRoom(roomId: string): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}`);
  },

  async setRoomLocked(roomId: string, locked: boolean): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}/lock`, {
      method: 'POST',
      body: { locked },
    });
  },

  async kickRoomMember(roomId: string, userId: string): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}/kick`, {
      method: 'POST',
      body: { userId },
    });
  },

  async endRoom(roomId: string): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}/end`, { method: 'POST' });
  },

  async seedRoomDemo(roomId: string): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}/demo`, { method: 'POST' });
  },
};