import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  Globe,
  Youtube,
  FileText,
  Search,
  Filter,
  Trash2,
  Sparkles,
  BookOpen,
  HelpCircle,
  Layers,
  Network,
  MessageSquare,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  MoreVertical,
  X,
  ExternalLink,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import { hasActivePipelines, pollDocumentsUntilSettled } from '@/lib/api/documents';
import { ApiError } from '@/lib/api/http';
import { DocumentItem, DocumentType, PipelineStatus } from '@/types';
import { Dropzone } from '@/components/upload/Dropzone';
import { LinkImportDialog } from '@/components/upload/LinkImportDialog';
import { PipelineStatusBadge } from '@/components/upload/PipelineStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBytes, formatTimeAgo } from '@/lib/utils';
import { toast } from 'sonner';

export const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspaceStore();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeDocForSheet, setActiveDocForSheet] = useState<DocumentItem | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<
    Array<{ id: string; name: string; progress: number; status: PipelineStatus }>
  >([]);
  const [pipelinePollFailed, setPipelinePollFailed] = useState(false);

  useEffect(() => {
    loadDocs();
  }, [activeWorkspaceId]);

  // Upload responses are serialised before the background pipeline starts, so
  // keep refreshing until every document settles (ready | error).
  const anyPipelineActive = hasActivePipelines(documents);
  useEffect(() => {
    if (!anyPipelineActive) return;
    const controller = new AbortController();
    pollDocumentsUntilSettled(() => api.getDocuments(activeWorkspaceId), {
      signal: controller.signal,
      intervalMs: 1000,
      maxWaitMs: 10 * 60_000,
      onSnapshot: (docs) => {
        if (!controller.signal.aborted) setDocuments(docs);
      },
    }).catch(() => {
      // Network hiccup mid-poll: stop quietly, the list keeps what it has.
      if (!controller.signal.aborted) setPipelinePollFailed(true);
    });
    return () => controller.abort();
  }, [anyPipelineActive, activeWorkspaceId]);

  async function loadDocs() {
    try {
      const list = await api.getDocuments(activeWorkspaceId);
      setDocuments(list);
      setPipelinePollFailed(false);
    } catch {
      setPipelinePollFailed(true);
    }
  }

  const handleFilesAccepted = async (files: File[]) => {
    let succeeded = 0;
    for (const file of files) {
      const queueId = `q_${Date.now()}_${Math.random()}`;
      setUploadQueue((q) => [
        { id: queueId, name: file.name, progress: 10, status: 'parsing' },
        ...q,
      ]);

      try {
        await api.uploadDocument(activeWorkspaceId, file, (progress, status) => {
          setUploadQueue((q) =>
            q.map((item) =>
              item.id === queueId
                ? { ...item, progress, status: status as PipelineStatus }
                : item
            )
          );
        });
        succeeded += 1;
      } catch (err) {
        // One bad file must not kill the batch: mark it failed, keep going.
        const message =
          err instanceof ApiError ? err.message : 'Upload failed. Please try again.';
        setUploadQueue((q) =>
          q.map((item) =>
            item.id === queueId ? { ...item, progress: 100, status: 'error' } : item
          )
        );
        toast.error(`${file.name}: ${message}`);
      }
      await loadDocs();
    }
    if (succeeded > 0) {
      toast.success(`Processed ${succeeded} document(s) successfully`);
    }
  };

  const handleReprocess = async (id: string) => {
    try {
      const updated = await api.reprocessDocument(id);
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      setActiveDocForSheet(updated);
      toast.success('Reprocessing started');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reprocess this document.';
      toast.error(message);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
    if (activeDocForSheet?.id === id) setActiveDocForSheet(null);
    toast.success('Document deleted from workspace vault');
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await api.deleteDocument(id);
    }
    setDocuments((prev) => prev.filter((d) => !selectedIds.includes(d.id)));
    setSelectedIds([]);
    toast.success('Selected documents deleted');
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDocs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDocs.map((d) => d.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const matchSearch = doc.name.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || doc.type === typeFilter;
    return matchSearch && matchType;
  });

  const getDocIcon = (type: DocumentType) => {
    if (type === 'youtube') return <Youtube className="h-4 w-4 text-red-500 shrink-0" />;
    if (type === 'web') return <Globe className="h-4 w-4 text-blue-500 shrink-0" />;
    return <FileText className="h-4 w-4 text-emerald-500 shrink-0" />;
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Document Vault
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Upload PDFs, DOCX, lecture videos, and technical specifications for citation-backed RAG
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLinkDialogOpen(true)}
            className="text-xs flex items-center gap-1.5"
          >
            <Globe className="h-3.5 w-3.5 text-blue-500" />
            <span>Add Link / YouTube</span>
          </Button>
        </div>
      </div>

      {/* Drag & Drop Dropzone */}
      <Dropzone onFilesAccepted={handleFilesAccepted} />

      {/* Active Upload Queue Strip */}
      {uploadQueue.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Ingestion Pipeline Activity ({uploadQueue.length})</span>
            <button
              onClick={() => setUploadQueue([])}
              className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Clear Completed
            </button>
          </div>
          <div className="space-y-2">
            {uploadQueue.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {item.name}
                  </span>
                </div>
                <PipelineStatusBadge status={item.status} progress={item.progress} />
              </div>
            ))}
          </div>
        </div>
      )}

      {pipelinePollFailed && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 -mt-2">
          Could not refresh pipeline status — the list may be out of date.
        </p>
      )}

      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search documents by title or topic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs h-9"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="pdf">PDF Textbooks</option>
            <option value="youtube">YouTube Lectures</option>
            <option value="web">Web Specifications</option>
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              className="text-xs h-9"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete ({selectedIds.length})
            </Button>
          )}

          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-850">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md cursor-pointer ${
                viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-emerald-500 shadow-xs' : 'text-slate-400'
              }`}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md cursor-pointer ${
                viewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-emerald-500 shadow-xs' : 'text-slate-400'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Documents Data View (Table or Grid) */}
      {viewMode === 'table' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-850/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="p-3 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {selectedIds.length === filteredDocs.length && filteredDocs.length > 0 ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="p-3">Document Name</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Pages / Duration</th>
                <th className="p-3 text-right">Chunks</th>
                <th className="p-3">Pipeline Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                    No documents found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => {
                  const isChecked = selectedIds.includes(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3">
                        <button
                          onClick={() => toggleSelectOne(doc.id)}
                          className="text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => setActiveDocForSheet(doc)}
                          className="flex items-center gap-2.5 font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-500 text-left cursor-pointer truncate max-w-md"
                        >
                          {getDocIcon(doc.type)}
                          <span className="truncate">{doc.name}</span>
                        </button>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-[10px] uppercase text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {doc.type}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {doc.pageCount
                          ? `${doc.pageCount} p.`
                          : doc.durationSeconds
                            ? `${doc.durationSeconds}s`
                            : '—'}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {doc.chunkCount}
                      </td>
                      <td className="p-3">
                        <PipelineStatusBadge status={doc.status} progress={doc.progressPercent} />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setActiveDocForSheet(doc)}
                            title="Inspect details and actions"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(doc.id)}
                            className="text-slate-400 hover:text-red-500"
                            title="Delete document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between hover:border-emerald-500/40 transition-all shadow-xs space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    {getDocIcon(doc.type)}
                  </div>
                  <PipelineStatusBadge status={doc.status} progress={doc.progressPercent} />
                </div>
                <h3
                  onClick={() => setActiveDocForSheet(doc)}
                  className="font-semibold text-xs text-slate-900 dark:text-slate-100 hover:text-emerald-500 cursor-pointer line-clamp-2"
                >
                  {doc.name}
                </h3>
                <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-slate-400">
                  <span>{formatBytes(doc.sizeBytes)}</span>
                  <span>·</span>
                  <span>{doc.pageCount ? `${doc.pageCount} pages` : 'Transcript'}</span>
                  <span>·</span>
                  <span>{doc.chunkCount} chunks</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => setActiveDocForSheet(doc)}
                  className="text-xs h-7"
                >
                  Actions & RAG
                </Button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document Detail Sheet / Drawer */}
      {activeDocForSheet && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="space-y-6 overflow-y-auto pr-1">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  {getDocIcon(activeDocForSheet.type)}
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {activeDocForSheet.name}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveDocForSheet(null)}
                  className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Metadata details */}
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <span>File Size</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {formatBytes(activeDocForSheet.sizeBytes)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <span>Pages / Duration</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {activeDocForSheet.pageCount
                      ? `${activeDocForSheet.pageCount} pages`
                      : activeDocForSheet.durationSeconds
                        ? `${activeDocForSheet.durationSeconds}s`
                        : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <span>Ingested Chunks</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {activeDocForSheet.chunkCount} vector passages
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <span>Added Date</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {formatTimeAgo(activeDocForSheet.createdAt)}
                  </span>
                </div>
              </div>

              {/* Pipeline failure, stated plainly */}
              {activeDocForSheet.status === 'error' && (
                <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  <span className="font-semibold block mb-1">Ingestion failed</span>
                  {activeDocForSheet.error || 'Something went wrong while processing this document.'}
                </div>
              )}

              {/* Sample Content */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Content Preview Sample
                </span>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-850 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-mono max-h-36 overflow-y-auto">
                  {activeDocForSheet.contentSample || 'No sample text available.'}
                </div>
              </div>

              {/* Quick Generative Actions */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  AI Study Workflows
                </span>
                <button
                  onClick={() => navigate('/app/chat')}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-slate-50 dark:bg-slate-850 text-left text-xs font-medium flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-500" />
                    <span>Chat With This Document</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/app/summaries?doc=' + activeDocForSheet.id)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-slate-50 dark:bg-slate-850 text-left text-xs font-medium flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-500" />
                    <span>Generate Multi-Level Summary</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/app/quizzes?generate=true')}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-slate-50 dark:bg-slate-850 text-left text-xs font-medium flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-amber-500" />
                    <span>Generate Retention Quiz</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/app/flashcards?doc=' + activeDocForSheet.id)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-slate-50 dark:bg-slate-850 text-left text-xs font-medium flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-purple-500" />
                    <span>Create SM-2 Flashcards</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/app/mindmap')}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-slate-50 dark:bg-slate-850 text-left text-xs font-medium flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-teal-500" />
                    <span>Synthesize Concept Mind Map</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeDocForSheet.status === 'error' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleReprocess(activeDocForSheet.id)}
                    className="text-xs"
                  >
                    Reprocess
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(activeDocForSheet.id)}
                  className="text-xs"
                >
                  Delete Document
                </Button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveDocForSheet(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Link Import Dialog */}
      <LinkImportDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        onSubmit={async (url, type) => {
          await api.addLinkDocument(activeWorkspaceId, url, type);
          await loadDocs();
        }}
      />
    </div>
  );
};
