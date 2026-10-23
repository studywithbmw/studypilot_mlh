import { describe, expect, it, vi } from 'vitest';
import type { DocumentItem, PipelineStatus } from '../../types';
import {
  hasActivePipelines,
  isActivePipelineStatus,
  pollDocumentsUntilSettled,
  toUploadError,
} from './documents';
import { ApiError } from './http';

function doc(status: PipelineStatus): DocumentItem {
  return {
    id: `doc_${status}`,
    workspaceId: 'ws_1',
    name: `${status}.pdf`,
    type: 'pdf',
    sizeBytes: 1024,
    chunkCount: 3,
    status,
    progressPercent: status === 'ready' ? 100 : 40,
    createdAt: new Date().toISOString(),
  };
}

describe('pipeline status', () => {
  it('treats only queued/parsing/chunking/embedding as in flight', () => {
    for (const status of ['queued', 'parsing', 'chunking', 'embedding'] as const) {
      expect(isActivePipelineStatus(status)).toBe(true);
    }
    for (const status of ['ready', 'error'] as const) {
      expect(isActivePipelineStatus(status)).toBe(false);
    }
  });

  it('hasActivePipelines is true while any document is in flight', () => {
    expect(hasActivePipelines([doc('ready'), doc('error')])).toBe(false);
    expect(hasActivePipelines([doc('ready'), doc('embedding')])).toBe(true);
    expect(hasActivePipelines([])).toBe(false);
  });
});

describe('toUploadError', () => {
  it('maps the backend error envelope', () => {
    const err = toUploadError(415, {
      error: { code: 'unsupported_file_type', message: 'That file type is not supported.', requestId: 'req-1' },
    });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(415);
    expect(err.code).toBe('unsupported_file_type');
    expect(err.message).toBe('That file type is not supported.');
    expect(err.requestId).toBe('req-1');
  });

  it('falls back to a generic message when the body is not the envelope', () => {
    const err = toUploadError(502, '<html>bad gateway</html>', 'req-2');
    expect(err.code).toBe('http_error');
    expect(err.message).toBe('Upload failed (502).');
    expect(err.requestId).toBe('req-2'); // X-Request-ID header, when present
  });

  it('prefers the envelope requestId over the header and tolerates null', () => {
    const err = toUploadError(413, { error: { requestId: 'req-3' } }, 'req-header');
    expect(err.requestId).toBe('req-3');
    expect(toUploadError(413, null).requestId).toBeUndefined();
    expect(toUploadError(413, null).message).toBe('Upload failed (413).');
  });
});

describe('pollDocumentsUntilSettled', () => {
  it('returns immediately when nothing is in flight', async () => {
    const fetchDocs = vi.fn().mockResolvedValue([doc('ready')]);
    const out = await pollDocumentsUntilSettled(fetchDocs, { intervalMs: 5 });
    expect(out.map((d) => d.status)).toEqual(['ready']);
    expect(fetchDocs).toHaveBeenCalledTimes(1);
  });

  it('keeps polling until every document settles', async () => {
    const snapshots = [
      [doc('queued')],
      [doc('embedding')],
      [doc('ready'), doc('error')],
    ];
    const fetchDocs = vi.fn().mockResolvedValueOnce(snapshots[0]).mockResolvedValueOnce(snapshots[1]).mockResolvedValue(snapshots[2]);
    const seen: string[][] = [];

    const out = await pollDocumentsUntilSettled(fetchDocs, {
      intervalMs: 5,
      onSnapshot: (docs) => seen.push(docs.map((d) => d.status)),
    });

    expect(fetchDocs).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([['queued'], ['embedding'], ['ready', 'error']]);
    expect(out.every((d) => !isActivePipelineStatus(d.status))).toBe(true);
  });

  it('gives up after maxWaitMs and returns the last snapshot', async () => {
    const fetchDocs = vi.fn().mockResolvedValue([doc('parsing')]);
    const out = await pollDocumentsUntilSettled(fetchDocs, {
      intervalMs: 5,
      maxWaitMs: 40,
    });
    expect(out[0].status).toBe('parsing'); // still in flight, but we stopped
    expect(fetchDocs.mock.calls.length).toBeGreaterThan(1);
  });

  it('propagates a fetch failure instead of swallowing it', async () => {
    const fetchDocs = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(pollDocumentsUntilSettled(fetchDocs, { intervalMs: 5 })).rejects.toThrow(
      'network down',
    );
    expect(fetchDocs).toHaveBeenCalledTimes(1);
  });

  it('stops without sleeping when the caller aborts', async () => {
    const controller = new AbortController();
    const fetchDocs = vi.fn().mockResolvedValue([doc('chunking')]);
    const out = await pollDocumentsUntilSettled(fetchDocs, {
      intervalMs: 5_000, // would hang for five seconds if the abort were ignored
      signal: controller.signal,
      onSnapshot: () => controller.abort(),
    });
    expect(fetchDocs).toHaveBeenCalledTimes(1);
    expect(out[0].status).toBe('chunking');
  });
});
