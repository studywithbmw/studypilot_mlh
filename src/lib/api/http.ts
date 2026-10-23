/**
 * Real-mode HTTP transport for the FastAPI backend.
 *
 * - Attaches the Supabase access token as a Bearer header.
 * - Parses the backend error envelope {"error":{"code","message","requestId"}}.
 * - On a 401 it asks the auth layer to refresh the token and retries once; if
 *   that still fails it calls the unauthorized handler (which signs out).
 * It deliberately knows nothing about Supabase: the auth store injects hooks.
 */
import { API_URL } from '../env';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface AuthHooks {
  getToken: () => Promise<string | null>;
  /** Force a token refresh; resolves to the new access token or null. */
  refresh: () => Promise<string | null>;
  onUnauthorized: () => void;
}

const noHooks: AuthHooks = {
  getToken: async () => null,
  refresh: async () => null,
  onUnauthorized: () => undefined,
};

let hooks: AuthHooks = noHooks;

export function setAuthHooks(next: AuthHooks | null): void {
  hooks = next ?? noHooks;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Set false for endpoints that need no token. */
  auth?: boolean;
  baseUrl?: string;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function buildUrl(path: string, opts: RequestOptions): string {
  return `${(opts.baseUrl ?? API_URL).replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = `Request failed (${res.status}).`;
  let requestId = res.headers.get('X-Request-ID') ?? undefined;
  try {
    const data = await res.json();
    const err = data?.error;
    if (err && typeof err === 'object') {
      if (typeof err.code === 'string') code = err.code;
      if (typeof err.message === 'string') message = err.message;
      if (typeof err.requestId === 'string') requestId = err.requestId;
    }
  } catch {
    // Non-JSON body (proxy error page etc.): keep the generic message.
  }
  return new ApiError(res.status, code, message, requestId);
}

async function send(
  url: string,
  opts: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  // timeoutMs === 0 means "no deadline" (used by long-lived streams).
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined;
  const onAbort = () => controller.abort();
  // A signal that is already aborted must still cancel the request, not hang.
  if (opts.signal?.aborted) controller.abort();
  else opts.signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err; // caller cancelled: let it propagate
    const timedOut = controller.signal.aborted;
    throw new ApiError(
      0,
      timedOut ? 'timeout' : 'network_error',
      timedOut
        ? 'The server took too long to respond. Please try again.'
        : 'Could not reach the server. Check your connection and try again.',
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function apiRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts);
  const useAuth = opts.auth !== false;

  let token = useAuth ? await hooks.getToken() : null;
  let res = await send(url, opts, token);

  if (res.status === 401 && useAuth) {
    token = await hooks.refresh();
    if (token) res = await send(url, opts, token);
    if (res.status === 401 || !token) {
      const err = await toApiError(res);
      hooks.onUnauthorized();
      throw err;
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Download-style request: returns the raw Blob (used by data export). */
export async function apiBlob(path: string, opts: RequestOptions = {}): Promise<Blob> {
  const url = buildUrl(path, opts);
  let token = await hooks.getToken();
  let res = await send(url, opts, token);
  if (res.status === 401) {
    token = await hooks.refresh();
    if (token) res = await send(url, opts, token);
    if (res.status === 401 || !token) {
      const err = await toApiError(res);
      hooks.onUnauthorized();
      throw err;
    }
  }
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

// ---------------------------------------------------------------------------
// Server-Sent Events
//
// EventSource cannot send a POST body or an Authorization header, so SSE is
// fetched with `fetch` and parsed from the ReadableStream ourselves.
// ---------------------------------------------------------------------------

export interface SSEMessage {
  event: string;
  data: string;
}

/** Current access token (used by the XHR upload path, which cannot use fetch). */
export async function getAuthToken(): Promise<string | null> {
  return hooks.getToken();
}

/**
 * Incremental SSE parser (WHATWG EventSource parsing, simplified).
 *
 * Feed it decoded text in whatever chunks arrive; it returns the messages
 * that became complete. Handles CRLF/CR/LF, `data:` continuation lines,
 * `event:` fields, and `:` heartbeat comments.
 */
export class SSEParser {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];

  push(chunk: string): SSEMessage[] {
    this.buffer += chunk;
    const messages: SSEMessage[] = [];
    for (;;) {
      const index = this.buffer.search(/\r\n|\r|\n/);
      if (index === -1) break;
      const crlf = this.buffer.startsWith('\r\n', index);
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + (crlf ? 2 : 1));
      const message = this.handleLine(line);
      if (message) messages.push(message);
    }
    return messages;
  }

  /** Emit a trailing message when a server omits the final newline or blank line. */
  flush(): SSEMessage[] {
    const messages: SSEMessage[] = [];
    if (this.buffer) {
      const message = this.handleLine(this.buffer);
      this.buffer = '';
      if (message) messages.push(message);
    }
    const trailing = this.handleLine('');
    if (trailing) messages.push(trailing);
    return messages;
  }

  private handleLine(line: string): SSEMessage | null {
    if (line === '') {
      if (this.dataLines.length === 0) {
        this.eventName = '';
        return null;
      }
      const message: SSEMessage = {
        event: this.eventName || 'message',
        data: this.dataLines.join('\n'),
      };
      this.eventName = '';
      this.dataLines = [];
      return message;
    }
    if (line.startsWith(':')) return null; // heartbeat comment
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.eventName = value;
    else if (field === 'data') this.dataLines.push(value);
    return null;
  }
}

/** Open an authenticated SSE stream. Resolves once the response headers are in. */
export async function apiSSEStream(
  path: string,
  opts: RequestOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const url = buildUrl(path, opts);
  const useAuth = opts.auth !== false;
  const streamOpts: RequestOptions = {
    ...opts,
    method: opts.method ?? 'POST',
    // No client-side deadline: the server closes the stream when it is done.
    timeoutMs: opts.timeoutMs ?? 0,
    headers: { Accept: 'text/event-stream', ...(opts.headers ?? {}) },
  };

  let token = useAuth ? await hooks.getToken() : null;
  let res = await send(url, streamOpts, token);
  if (res.status === 401 && useAuth) {
    token = await hooks.refresh();
    if (token) res = await send(url, streamOpts, token);
    if (res.status === 401 || !token) {
      const err = await toApiError(res);
      hooks.onUnauthorized();
      throw err;
    }
  }
  if (!res.ok) throw await toApiError(res);
  if (!res.body) {
    throw new ApiError(0, 'stream_error', 'The server returned an empty stream. Please try again.');
  }
  return res.body;
}

/** Read an SSE stream to completion, yielding parsed messages. */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const message of parser.push(decoder.decode(value, { stream: true }))) {
        yield message;
      }
    }
    const tail = decoder.decode();
    if (tail) for (const message of parser.push(tail)) yield message;
    for (const message of parser.flush()) yield message;
  } finally {
    reader.releaseLock();
  }
}
