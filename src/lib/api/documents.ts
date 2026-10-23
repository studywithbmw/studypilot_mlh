/**
 * Document-pipeline helpers shared by `apiClient` and the Documents page:
 *
 * - `toUploadError` maps a failed multipart response onto the standard
 *   `{"error": {code, message, requestId}}` envelope so upload failures look
 *   exactly like every other API failure.
 * - `pollDocumentsUntilSettled` re-reads the document list until no document
 *   is still moving through the ingestion pipeline (`queued → parsing →
 *   chunking → embedding → ready | error`), because upload/link/reprocess
 *   responses are serialised *before* the background task runs.
 */
import type { DocumentItem, PipelineStatus } from '../../types';
import { ApiError } from './http';

/** Statuses that mean "the backend is still working on this document". */
export const ACTIVE_PIPELINE_STATUSES: readonly PipelineStatus[] = [
  'queued',
  'parsing',
  'chunking',
  'embedding',
];

export function isActivePipelineStatus(status: PipelineStatus): boolean {
  return ACTIVE_PIPELINE_STATUSES.includes(status);
}

export function hasActivePipelines(docs: readonly DocumentItem[]): boolean {
  return docs.some((doc) => isActivePipelineStatus(doc.status));
}

/** Map an XHR upload failure onto the backend's error envelope. */
export function toUploadError(
  status: number,
  payload: unknown,
  requestId?: string | null,
): ApiError {
  const envelope = (
    payload as { error?: { code?: unknown; message?: unknown; requestId?: unknown } } | null
  )?.error;
  const code = typeof envelope?.code === 'string' ? envelope.code : 'http_error';
  const message =
    typeof envelope?.message === 'string' ? envelope.message : `Upload failed (${status}).`;
  const id =
    typeof envelope?.requestId === 'string'
      ? envelope.requestId
      : requestId ?? undefined;
  return new ApiError(status, code, message, id);
}

export interface PollDocumentsOptions {
  /** Delay between snapshots. */
  intervalMs?: number;
  /** Give up after this long and return the last snapshot. */
  maxWaitMs?: number;
  /** Abort stops the loop between (or during) sleeps. */
  signal?: AbortSignal;
  /** Called with every snapshot, including the first, as it arrives. */
  onSnapshot?: (docs: DocumentItem[]) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/**
 * Fetch until nothing is in flight. Resolves with the last snapshot either
 * way — a timeout is not an error, the caller decides what to render.
 * Fetch failures propagate so the caller can show them and stop.
 */
export async function pollDocumentsUntilSettled(
  fetchDocs: () => Promise<DocumentItem[]>,
  options: PollDocumentsOptions = {},
): Promise<DocumentItem[]> {
  const intervalMs = options.intervalMs ?? 1500;
  const maxWaitMs = options.maxWaitMs ?? 60_000;
  const started = Date.now();

  let snapshot = await fetchDocs();
  options.onSnapshot?.(snapshot);

  while (hasActivePipelines(snapshot)) {
    if (options.signal?.aborted) break;
    if (Date.now() - started >= maxWaitMs) break;
    await sleep(intervalMs, options.signal);
    if (options.signal?.aborted) break;
    snapshot = await fetchDocs();
    options.onSnapshot?.(snapshot);
  }
  return snapshot;
}
