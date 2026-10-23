/**
 * Real-mode chat transport (Stage 5).
 *
 * `POST /chat/stream` emits the same event sequence the demo mock produces —
 * `trace`, `retrieval`, `token`, `citation`, `critic`, `done` — over SSE, so
 * this module maps those frames onto the `StreamEvent` shape the ChatPage
 * already consumes. The mapping and the reducers are pure so they can be
 * unit-tested without a server.
 *
 * Failure contract (identical to Quick Ask):
 * - quota/validation failures happen before the stream opens and arrive as a
 *   normal `ApiError` with the real HTTP status;
 * - provider failures after the 200 arrive as an `error` event and are thrown
 *   as an `ApiError` carrying its code and message;
 * - aborting the AbortSignal cancels the fetch, which closes the response
 *   body and makes the server cancel its upstream LLM call.
 */
import type {
  AgentReasoningStep,
  AIModelId,
  ChatMessage,
  Citation,
  ExplanationLevel,
  RetrievalInspectionItem,
  SupportedLanguage,
} from '../../types';
import { ApiError, apiSSEStream, parseSSEStream, type SSEMessage } from './http';

/** The generator's public shape (matches the demo mock). */
export interface StreamEvent {
  type: 'trace' | 'retrieval' | 'token' | 'citation' | 'critic' | 'done';
  data: unknown;
}

export interface ChatStreamParams {
  conversationId: string;
  query: string;
  workspaceId: string;
  level: ExplanationLevel;
  language: SupportedLanguage;
  model: AIModelId;
  /** Opt-in: answer from general knowledge when retrieval finds nothing. */
  generalKnowledge?: boolean;
  /** Cancels the request; the server closes its LLM stream. */
  signal?: AbortSignal;
}

/** Event names the server may send; anything else is ignored. */
const STREAM_EVENTS = new Set(['trace', 'retrieval', 'token', 'citation', 'critic', 'done']);

export function toChatBody(params: ChatStreamParams): Record<string, unknown> {
  return {
    conversationId: params.conversationId,
    query: params.query,
    explanationLevel: params.level,
    answerLanguage: params.language,
    model: params.model,
    generalKnowledge: params.generalKnowledge ?? false,
  };
}

/** Parse one SSE frame into a StreamEvent; returns null for unknown frames. */
export function toStreamEvent(message: SSEMessage): StreamEvent | null {
  if (!STREAM_EVENTS.has(message.event)) return null;
  const data = message.data === '' || message.data === 'null' ? null : safeParse(message.data);
  return { type: message.event as StreamEvent['type'], data };
}

function safeParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Open the chat stream and yield its events in order.
 *
 * Throws `ApiError` for `error` frames (mid-stream failures) and for
 * non-2xx responses; an aborted signal rejects with the browser's
 * AbortError, unchanged, so callers can tell "stopped" from "failed".
 */
export async function* streamChatEvents(
  params: ChatStreamParams,
): AsyncGenerator<StreamEvent, void, unknown> {
  const stream = await apiSSEStream('/chat/stream', {
    method: 'POST',
    body: toChatBody(params),
    signal: params.signal,
  });

  for await (const message of parseSSEStream(stream)) {
    if (message.event === 'error') {
      const payload = safeParse(message.data) as { code?: string; message?: string } | null;
      throw new ApiError(
        0,
        payload?.code || 'upstream_error',
        payload?.message || 'Something went wrong. Please try again.',
      );
    }
    const event = toStreamEvent(message);
    if (event) yield event;
  }
}

// ---------------------------------------------------------------------------
// Reducers: one event -> the next assistant message state
// ---------------------------------------------------------------------------

function tierForScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

/**
 * Confidence shown under an answer. The server computes it and streams it on
 * the critic step; the fallback derives a tier from the verdict alone.
 */
export function criticConfidence(data: unknown): {
  score: number | undefined;
  tier: 'high' | 'medium' | 'low' | undefined;
  isNotFound: boolean;
} {
  const step = (data ?? {}) as Partial<AgentReasoningStep> & {
    confidence?: number;
    tier?: 'high' | 'medium' | 'low';
    isNotFound?: boolean;
  };
  const verdict = step.criticVerdict;
  let score = step.confidence;
  if (typeof score !== 'number' && verdict) {
    score = verdict.hallucinationDetected ? 28 : verdict.passed ? 92 : 62;
  }
  return {
    score,
    tier: step.tier ?? (typeof score === 'number' ? tierForScore(score) : undefined),
    isNotFound: step.isNotFound === true,
  };
}

/** Apply one streamed event to the placeholder assistant message. */
export function applyStreamEvent(message: ChatMessage, event: StreamEvent): ChatMessage {
  switch (event.type) {
    case 'token':
      return { ...message, content: message.content + String(event.data ?? '') };
    case 'trace': {
      const step = event.data as AgentReasoningStep | null;
      if (!step) return message;
      return { ...message, reasoningTrace: [...(message.reasoningTrace ?? []), step] };
    }
    case 'retrieval':
      return {
        ...message,
        retrievalInspection: (event.data as RetrievalInspectionItem[] | null) ?? [],
      };
    case 'citation':
      return { ...message, citations: (event.data as Citation[] | null) ?? [] };
    case 'critic': {
      const step = event.data as
        | (AgentReasoningStep & { confidence?: number; tier?: 'high' | 'medium' | 'low'; isNotFound?: boolean })
        | null;
      if (!step) return message;
      const { score, tier, isNotFound } = criticConfidence(step);
      return {
        ...message,
        confidenceScore: score ?? message.confidenceScore,
        confidenceTier: tier ?? message.confidenceTier,
        isNotFound: isNotFound || message.isNotFound,
        reasoningTrace: [...(message.reasoningTrace ?? []), step],
      };
    }
    default:
      return message;
  }
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

/** Label for a citation chip: `DBMS Notes.pdf · p. 14` (or a timestamp). */
export function citationChipLabel(citation: Citation): string {
  const where = citation.pageNumber != null ? `p. ${citation.pageNumber}` : citation.timestamp;
  return where ? `${citation.documentName} · ${where}` : citation.documentName;
}

/** The reference marker shown inline in the answer text, e.g. `[1]`. */
export function citationMarker(index: number): string {
  return `[${index}]`;
}

/**
 * Which document a citation opens. Citations always name their document, so
 * this never guesses: an unknown id returns undefined and the caller falls
 * back to the currently open document.
 */
export function findCitationDocument<T extends { id: string }>(
  documents: readonly T[],
  citation: Citation,
): T | undefined {
  return documents.find((doc) => doc.id === citation.documentId);
}
