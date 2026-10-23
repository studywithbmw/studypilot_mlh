import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setAuthHooks } from './http';
import {
  applyStreamEvent,
  citationChipLabel,
  criticConfidence,
  findCitationDocument,
  streamChatEvents,
  toChatBody,
  toStreamEvent,
  type StreamEvent,
} from './chat';
import type { ChatMessage, Citation } from '../../types';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAuthHooks({ getToken: async () => 'tok', refresh: async () => null, onUnauthorized: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAuthHooks(null);
});

const encoder = new TextEncoder();

const sseBody = (...frames: string[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );

const params = {
  conversationId: 'conv-1',
  query: 'What is 2PC?',
  workspaceId: 'ws-1',
  level: 'student' as const,
  language: 'en' as const,
  model: 'auto' as const,
};

const emptyMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'assistant',
  content: '',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const citation = (overrides: Partial<Citation> = {}): Citation => ({
  id: 'chunk-1',
  documentId: 'doc-1',
  documentName: 'DBMS Notes.pdf',
  pageNumber: 14,
  snippet: 'Two-phase locking…',
  confidence: 0.91,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Frame mapping
// ---------------------------------------------------------------------------

describe('toStreamEvent', () => {
  it('maps the frames the server emits', () => {
    expect(toStreamEvent({ event: 'token', data: '"hello "' })).toEqual({
      type: 'token',
      data: 'hello ',
    });
    expect(toStreamEvent({ event: 'retrieval', data: '[{"chunkId":"c1"}]' })).toEqual({
      type: 'retrieval',
      data: [{ chunkId: 'c1' }],
    });
    expect(toStreamEvent({ event: 'done', data: 'null' })).toEqual({ type: 'done', data: null });
    expect(toStreamEvent({ event: 'citation', data: '' })).toEqual({
      type: 'citation',
      data: null,
    });
  });

  it('ignores unknown events and malformed payloads', () => {
    expect(toStreamEvent({ event: 'ping', data: '{}' })).toBeNull();
    expect(toStreamEvent({ event: 'token', data: 'not json' })).toEqual({
      type: 'token',
      data: null,
    });
  });
});

describe('toChatBody', () => {
  it('sends the camelCase body the API validates', () => {
    expect(toChatBody({ ...params, generalKnowledge: true })).toEqual({
      conversationId: 'conv-1',
      query: 'What is 2PC?',
      explanationLevel: 'student',
      answerLanguage: 'en',
      model: 'auto',
      generalKnowledge: true,
    });
    expect(toChatBody(params).generalKnowledge).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The stream
// ---------------------------------------------------------------------------

describe('streamChatEvents', () => {
  it('POSTs with auth and yields events in order', async () => {
    fetchMock.mockResolvedValue(
      sseBody(
        'event: trace\ndata: {"agent":"Planner","durationMs":4,"status":"completed","outputSnippet":"scope"}\n\n',
        'event: retrieval\ndata: [{"chunkId":"c1","docName":"Notes.pdf"}]\n\n',
        'event: token\ndata: "Two-phase "\n\n',
        'event: token\ndata: "locking [1]."\n\n',
        'event: citation\ndata: [{"id":"c1","documentId":"d1","documentName":"Notes.pdf","pageNumber":3,"snippet":"…","confidence":0.8}]\n\n',
        'event: critic\ndata: {"agent":"Critic","confidence":92,"tier":"high","criticVerdict":{"passed":true,"hallucinationDetected":false,"note":"ok"}}\n\n',
        'event: done\ndata: null\n\n',
      ),
    );

    const seen: StreamEvent[] = [];
    for await (const event of streamChatEvents(params)) seen.push(event);

    expect(seen.map((e) => e.type)).toEqual([
      'trace',
      'retrieval',
      'token',
      'token',
      'citation',
      'critic',
      'done',
    ]);
    expect(seen[2].data).toBe('Two-phase ');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/chat/stream');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Accept).toBe('text/event-stream');
    expect(JSON.parse(init.body)).toMatchObject({ conversationId: 'conv-1' });
  });

  it('throws an ApiError carrying the server code on an error event', async () => {
    fetchMock.mockResolvedValue(
      sseBody('event: token\ndata: "partial "\n\n', 'event: error\ndata: {"code":"upstream_error","message":"The AI service is temporarily unavailable."}\n\n'),
    );
    const err: unknown = await (async () => {
      for await (const _event of streamChatEvents(params)) {
        // consume
      }
    })().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'upstream_error' });
  });

  it('surfaces a quota rejection before the stream as a HTTP ApiError', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'quota_exceeded', message: 'Daily limit reached', requestId: 'r1' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const err = await (async () => {
      for await (const _event of streamChatEvents(params)) {
        // never reached
      }
    })().catch((e) => e);
    expect(err).toMatchObject({ status: 429, code: 'quota_exceeded', message: 'Daily limit reached' });
  });

  it('aborting the signal cancels the request and ends the stream', async () => {
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
        controller.enqueue(encoder.encode('event: token\ndata: "partial "\n\n'));
        // never closes: the answer is still streaming
      },
    });
    fetchMock.mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const controller = new AbortController();
    const events: StreamEvent[] = [];
    let failure: unknown = null;
    try {
      for await (const event of streamChatEvents({ ...params, signal: controller.signal })) {
        events.push(event);
        if (events.length === 1) {
          // What a browser does when the fetch is aborted: the body errors.
          controller.abort();
          bodyController.error(new DOMException('The operation was aborted.', 'AbortError'));
        }
      }
    } catch (error) {
      failure = error;
    }
    expect(events).toHaveLength(1);
    expect((failure as { name?: string } | null)?.name).toBe('AbortError');
    // Not wrapped: callers must be able to tell "stopped" from "failed".
    expect(failure).not.toBeInstanceOf(ApiError);
  });
});

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

describe('applyStreamEvent', () => {
  it('appends tokens to the message content', () => {
    const out = applyStreamEvent(emptyMessage({ content: 'Two-phase ' }), {
      type: 'token',
      data: 'locking [1].',
    });
    expect(out.content).toBe('Two-phase locking [1].');
  });

  it('collects trace steps and replaces the retrieval inspection', () => {
    let message = applyStreamEvent(emptyMessage(), {
      type: 'trace',
      data: { agent: 'Planner', durationMs: 1, status: 'completed', outputSnippet: 'scope' },
    });
    message = applyStreamEvent(message, {
      type: 'retrieval',
      data: [{ chunkId: 'c1', docName: 'Notes.pdf', pageOrTime: 'p. 3' }],
    });
    message = applyStreamEvent(message, { type: 'trace', data: { agent: 'Retriever' } });
    expect(message.reasoningTrace?.map((step) => step.agent)).toEqual(['Planner', 'Retriever']);
    expect(message.retrievalInspection).toHaveLength(1);
  });

  it('renders citations from the citation event', () => {
    const out = applyStreamEvent(emptyMessage({ content: 'answer [1]' }), {
      type: 'citation',
      data: [citation()],
    });
    expect(out.citations).toHaveLength(1);
    expect(citationChipLabel(out.citations![0])).toBe('DBMS Notes.pdf · p. 14');
    expect(citationChipLabel(citation({ pageNumber: undefined, timestamp: '3:20' }))).toBe(
      'DBMS Notes.pdf · 3:20',
    );
  });

  it('takes the server confidence for the critic verdict', () => {
    const out = applyStreamEvent(emptyMessage(), {
      type: 'critic',
      data: {
        agent: 'Critic',
        confidence: 88,
        tier: 'high',
        criticVerdict: { passed: true, hallucinationDetected: false, note: 'grounded' },
      },
    });
    expect(out.confidenceScore).toBe(88);
    expect(out.confidenceTier).toBe('high');
    expect(out.reasoningTrace).toHaveLength(1);
  });

  it('derives a tier from the verdict when the server sends no score', () => {
    expect(
      criticConfidence({ criticVerdict: { passed: true, hallucinationDetected: false, note: '' } }),
    ).toEqual({ score: 92, tier: 'high', isNotFound: false });
    expect(
      criticConfidence({ criticVerdict: { passed: false, hallucinationDetected: true, note: '' } }),
    ).toEqual({ score: 28, tier: 'low', isNotFound: false });
  });

  it('marks an abstained answer as not found', () => {
    const out = applyStreamEvent(emptyMessage({ content: "I couldn't find this in your documents." }), {
      type: 'critic',
      data: {
        agent: 'Critic',
        isNotFound: true,
        confidence: 100,
        tier: 'high',
        criticVerdict: { passed: true, hallucinationDetected: false, note: 'none' },
      },
    });
    expect(out.isNotFound).toBe(true);
    expect(out.confidenceScore).toBe(100);
  });

  it('never mutates the previous message object', () => {
    const before = emptyMessage({ content: 'a' });
    applyStreamEvent(before, { type: 'token', data: 'b' });
    expect(before.content).toBe('a');
  });
});

describe('findCitationDocument', () => {
  it('resolves the document a citation opens', () => {
    const documents = [
      { id: 'doc-1', name: 'DBMS Notes.pdf' },
      { id: 'doc-2', name: 'OS.pdf' },
    ];
    expect(findCitationDocument(documents, citation())?.name).toBe('DBMS Notes.pdf');
    expect(findCitationDocument(documents, citation({ documentId: 'missing' }))).toBeUndefined();
  });
});
