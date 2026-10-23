import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, SSEParser, apiSSEStream, parseSSEStream, setAuthHooks } from './http';

const collect = (parser: SSEParser, chunks: string[]) =>
  chunks.flatMap((chunk) => parser.push(chunk));

describe('SSEParser', () => {
  it('parses a single message', () => {
    const parser = new SSEParser();
    expect(collect(parser, ['event: token\ndata: {"text":"hi"}\n\n'])).toEqual([
      { event: 'token', data: '{"text":"hi"}' },
    ]);
  });

  it('reassembles messages split across arbitrary chunk boundaries', () => {
    const wire = 'event: token\ndata: {"text":"Hello world"}\n\nevent: done\ndata: {}\n\n';
    const expected = [
      { event: 'token', data: '{"text":"Hello world"}' },
      { event: 'done', data: '{}' },
    ];
    for (const size of [1, 3, 7, 13]) {
      const chunks: string[] = [];
      for (let i = 0; i < wire.length; i += size) chunks.push(wire.slice(i, i + size));
      // A fresh parser per chunking: results must not depend on chunk size.
      expect(collect(new SSEParser(), chunks)).toEqual(expected);
    }
  });

  it('handles CRLF and lone-CR line endings', () => {
    expect(collect(new SSEParser(), ['event: a\r\ndata: 1\r\n\r\n'])).toEqual([
      { event: 'a', data: '1' },
    ]);
    expect(collect(new SSEParser(), ['event: a\rdata: 1\r\r'])).toEqual([
      { event: 'a', data: '1' },
    ]);
  });

  it('joins repeated data lines with a newline', () => {
    expect(collect(new SSEParser(), ['data: line1\ndata: line2\n\n'])).toEqual([
      { event: 'message', data: 'line1\nline2' },
    ]);
  });

  it('ignores heartbeat comments and unknown fields', () => {
    const parser = new SSEParser();
    expect(collect(parser, [': heartbeat\n\nid: 7\ndata: x\n\n'])).toEqual([
      { event: 'message', data: 'x' },
    ]);
  });

  it('produces nothing for blank lines with no pending data', () => {
    expect(collect(new SSEParser(), ['\n\n\n'])).toEqual([]);
  });

  it('strips exactly one leading space from a value', () => {
    expect(collect(new SSEParser(), ['data:  spaced\n\n'])).toEqual([
      { event: 'message', data: ' spaced' },
    ]);
    expect(collect(new SSEParser(), ['data:x\n\n'])).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('emits a trailing message when the server omits the final blank line', () => {
    const parser = new SSEParser();
    expect(collect(parser, ['event: done\ndata: {}'])).toEqual([]);
    expect(parser.flush()).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('resets state between messages', () => {
    const parser = new SSEParser();
    const out = collect(parser, ['event: token\ndata: a\n\ndata: b\n\n']);
    expect(out).toEqual([
      { event: 'token', data: 'a' },
      { event: 'message', data: 'b' },
    ]);
  });
});

describe('parseSSEStream', () => {
  const streamOf = (parts: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });

  it('yields nothing for an empty stream', async () => {
    const out = [];
    for await (const message of parseSSEStream(streamOf([]))) out.push(message);
    expect(out).toEqual([]);
  });

  it('decodes UTF-8 text split mid-character', async () => {
    const wire = 'data: {"text":"தமிழ்"}\n\n';
    const bytes = new TextEncoder().encode(wire);
    const mid = 16; // inside a multi-byte Tamil code point
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, mid));
        controller.enqueue(bytes.slice(mid));
        controller.close();
      },
    });
    const messages = [];
    for await (const message of parseSSEStream(stream)) messages.push(message);
    expect(messages).toEqual([{ event: 'message', data: '{"text":"தமிழ்"}' }]);
  });

  it('yields every message in order', async () => {
    const out = [];
    for await (const message of parseSSEStream(
      streamOf(['event: token\ndata: a\n\nevent: done\ndata: {}\n\n']),
    )) {
      out.push(message);
    }
    expect(out.map((m) => m.event)).toEqual(['token', 'done']);
  });
});

const BASE = 'http://api.test/api/v1';
let fetchMock: ReturnType<typeof vi.fn>;

const sseResponse = (body: string) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAuthHooks(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAuthHooks(null);
});

describe('apiSSEStream', () => {
  it('POSTs with the bearer token and an SSE accept header', async () => {
    setAuthHooks({ getToken: async () => 'tok', refresh: async () => null, onUnauthorized: vi.fn() });
    fetchMock.mockResolvedValue(sseResponse(''));
    await apiSSEStream('/ai/quick-ask', { baseUrl: BASE, body: { text: 'hi' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/ai/quick-ask`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Accept).toBe('text/event-stream');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('sets no client-side deadline so long streams are not aborted', async () => {
    setAuthHooks({ getToken: async () => null, refresh: async () => null, onUnauthorized: vi.fn() });
    fetchMock.mockResolvedValue(sseResponse(''));
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await apiSSEStream('/ai/quick-ask', { baseUrl: BASE, body: {} });
    expect(spy.mock.calls.some(([, ms]) => ms === 30_000)).toBe(false);
    spy.mockRestore();
  });

  it('throws the backend error envelope for a pre-stream failure', async () => {
    setAuthHooks({ getToken: async () => 't', refresh: async () => null, onUnauthorized: vi.fn() });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'quota_exceeded', message: "You have reached today's limit of 100 AI requests", requestId: 'r1' },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const err: unknown = await apiSSEStream('/ai/quick-ask', { baseUrl: BASE, body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'quota_exceeded' });
    expect((err as Error).message).toContain('limit of 100');
  });

  it('refreshes once on 401 and retries', async () => {
    const refresh = vi.fn().mockResolvedValue('new');
    setAuthHooks({ getToken: async () => 'old', refresh, onUnauthorized: vi.fn() });
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(sseResponse(''));
    await apiSSEStream('/ai/quick-ask', { baseUrl: BASE, body: {} });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('signs out when the retry is still 401', async () => {
    const onUnauthorized = vi.fn();
    setAuthHooks({ getToken: async () => 'old', refresh: async () => 'new', onUnauthorized });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Invalid token' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(apiSSEStream('/ai/quick-ask', { baseUrl: BASE, body: {} })).rejects.toMatchObject({
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('rejects a response with no body', async () => {
    setAuthHooks({ getToken: async () => null, refresh: async () => null, onUnauthorized: vi.fn() });
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(apiSSEStream('/ai/quick-ask', { baseUrl: BASE, body: {} })).rejects.toMatchObject({
      code: 'stream_error',
    });
  });
});
