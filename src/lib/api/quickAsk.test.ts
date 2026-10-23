import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setAuthHooks } from './http';
import { streamQuickAsk } from './apiClient';
import { API_URL } from '../env';

let fetchMock: ReturnType<typeof vi.fn>;

const sse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAuthHooks({ getToken: async () => 'tok', refresh: async () => null, onUnauthorized: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAuthHooks(null);
});

describe('streamQuickAsk', () => {
  it('sends level and language and returns the streamed answer', async () => {
    fetchMock.mockResolvedValue(
      sse(
        'event: token\ndata: {"text":"Two"}\n\n' +
          'event: token\ndata: {"text":"-phase"}\n\n' +
          'event: done\ndata: {"provider":"groq","model":"m","latencyMs":9,"usage":{"promptTokens":1,"completionTokens":2,"totalTokens":3}}\n\n',
      ),
    );
    const tokens: string[] = [];
    const answer = await streamQuickAsk('What is 2PC?', {
      level: 'eli5',
      language: 'hi',
      onToken: (t) => tokens.push(t),
    });
    expect(answer).toBe('Two-phase');
    expect(tokens).toEqual(['Two', '-phase']);

    const [, init] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/ai/quick-ask`);
    expect(JSON.parse(init.body)).toEqual({
      text: 'What is 2PC?',
      explanationLevel: 'eli5',
      language: 'hi',
    });
  });

  it('omits level and language when they are not supplied', async () => {
    fetchMock.mockResolvedValue(sse('event: done\ndata: {}\n\n'));
    await streamQuickAsk('hi');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: 'hi' });
  });

  it('turns an error event into a typed ApiError', async () => {
    fetchMock.mockResolvedValue(
      sse('event: error\ndata: {"code":"upstream_error","message":"The AI service is temporarily unavailable."}\n\n'),
    );
    const err: unknown = await streamQuickAsk('hi').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'upstream_error' });
    expect((err as Error).message).toContain('temporarily unavailable');
  });

  it('surfaces a pre-stream quota rejection with the backend message', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'quota_exceeded',
            message: "You have reached today's limit of 100 AI requests (100 used).",
            requestId: 'r1',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const err: unknown = await streamQuickAsk('hi').catch((e) => e);
    expect(err).toMatchObject({ status: 429, code: 'quota_exceeded' });
    expect((err as Error).message).toContain('limit of 100');
  });

  it('ignores an error event without a payload', async () => {
    fetchMock.mockResolvedValue(sse('event: error\ndata: not-json\n\n'));
    const err: unknown = await streamQuickAsk('hi').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as Error).message).toBe(
      'The AI service is temporarily unavailable. Please try again.',
    );
  });

  it('forwards the abort signal and propagates the AbortError', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          const signal = init.signal;
          const abort = () => rej(new DOMException('aborted', 'AbortError'));
          if (signal?.aborted) abort();
          else signal?.addEventListener('abort', abort);
        }),
    );
    const promise = streamQuickAsk('hi', { signal: controller.signal });
    // Abort on the next tick so the request has actually been issued.
    await Promise.resolve();
    controller.abort();
    const err: unknown = await promise.catch((e) => e);
    expect((err as DOMException).name).toBe('AbortError');
    // The caller's abort must reach the in-flight request.
    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  });

  it('tolerates token events with no text', async () => {
    fetchMock.mockResolvedValue(
      sse('event: token\ndata: {}\n\nevent: token\ndata: {"text":"ok"}\n\nevent: done\ndata: {}\n\n'),
    );
    await expect(streamQuickAsk('hi')).resolves.toBe('ok');
  });
});
