import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Sparkles,
  Copy,
  RefreshCw,
  Download,
  FileText,
  Check,
  Trash2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import { DocumentItem, SummaryNote } from '@/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { CitationChip } from '@/components/ai/CitationChip';
import { ExportDialog } from '@/components/share/ExportDialog';
import { ConfirmDeleteDialog } from '@/components/common/ConfirmDeleteDialog';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/http';

export const SummariesPage: React.FC = () => {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [searchParams] = useSearchParams();
  const requestedDocId = searchParams.get('doc');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'short' | 'detailed' | 'bullet' | 'terms'>('detailed');
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState<SummaryNote | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedNotes, setSavedNotes] = useState<SummaryNote[]>([]);
  const [noteToDelete, setNoteToDelete] = useState<SummaryNote | null>(null);

  const findSaved = (docId: string, level: string) =>
    savedNotes.find((n) => n.documentId === docId && n.level === level) ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadDocs() {
      try {
        const [allDocs, saved] = await Promise.all([
          api.getDocuments(activeWorkspaceId),
          api.getSavedSummaries(activeWorkspaceId).catch(() => [] as SummaryNote[]),
        ]);
        const list = allDocs.filter((d) => d.status === 'ready');
        if (cancelled) return;
        setDocuments(list);
        setSavedNotes(saved);
        setSummary(null);
        // Honour ?doc= from the Documents page; otherwise the newest ready document.
        setSelectedDocId(list.find((d) => d.id === requestedDocId)?.id ?? list[0]?.id ?? '');
      } catch (e) {
        if (!cancelled) toast.error(e instanceof ApiError ? e.message : 'Could not load documents.');
      }
    }
    loadDocs();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, requestedDocId]);

  // Show the saved copy for the chosen document + style (no AI call needed).
  useEffect(() => {
    setSummary(findSaved(selectedDocId, activeTab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId, activeTab, savedNotes]);

  // Summaries cost an AI call, so nothing is generated until the student asks.
  const generate = async (docId: string, level: 'short' | 'detailed' | 'bullet' | 'terms') => {
    if (!docId) return;
    setIsGenerating(true);
    try {
      const result = await api.generateSummary(docId, level);
      setSavedNotes((prev) => [
        result,
        ...prev.filter((n) => !(n.documentId === docId && n.level === level)),
      ]);
      setSummary(result);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not generate the summary. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTabChange = (newLevel: string) => {
    const lvl = newLevel as 'short' | 'detailed' | 'bullet' | 'terms';
    setActiveTab(lvl);
    // Saved summaries open instantly; only a missing one costs an AI call.
    if (selectedDocId && !findSaved(selectedDocId, lvl)) {
      generate(selectedDocId, lvl);
    }
  };

  const handleDeleteNote = async () => {
    if (!noteToDelete) return;
    try {
      await api.deleteSavedNote(noteToDelete.id);
      setSavedNotes((prev) => prev.filter((n) => n.id !== noteToDelete.id));
      toast.success('Summary deleted.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not delete the summary.');
      throw e;
    }
  };

  const openSaved = (note: SummaryNote) => {
    if (note.documentId) setSelectedDocId(note.documentId);
    setActiveTab(note.level);
  };

  const handleCopy = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary.content);
    setCopied(true);
    toast.success('Summary copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            AI Summaries & Syntheses
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Generate executive abstracts, deep technical notes, and key glossary terms with cited section anchors
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedDocId}
            onChange={(e) => {
              setSelectedDocId(e.target.value);
              setSummary(null);
            }}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer max-w-xs truncate"
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => generate(selectedDocId, activeTab)}
            disabled={isGenerating || !selectedDocId}
            className="text-xs h-9 flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{summary ? 'Regenerate' : 'Generate'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
            disabled={!summary}
            className="text-xs h-9 flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </Button>
        </div>
      </div>

      {/* Synthesis Mode Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="short">Short Abstract</TabsTrigger>
          <TabsTrigger value="detailed">Executive Synthesis</TabsTrigger>
          <TabsTrigger value="bullet">Bullet Notes</TabsTrigger>
          <TabsTrigger value="terms">Key Terms & Glossary</TabsTrigger>
        </TabsList>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-6">
          {/* Header info */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                {summary?.title || (isGenerating ? 'Writing your summary…' : 'No summary yet')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-8">
                {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </Button>
              {summary && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNoteToDelete(summary)}
                  className="text-xs h-8 text-red-500 hover:text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  <span>Delete</span>
                </Button>
              )}
            </div>
          </div>

          {/* Body Content */}
          {isGenerating ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
              <p className="text-xs font-mono">Reading your document and writing the summary…</p>
            </div>
          ) : (
            <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line space-y-3">
              {summary?.content ||
                (documents.length === 0
                  ? 'Upload a document and wait until it is processed, then come back to summarize it.'
                  : 'Pick a style above and press Generate.')}
            </div>
          )}

          {/* Section-wise citations */}
          {summary?.citations && summary.citations.length > 0 && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs">
              <span className="text-slate-400">Cited Section:</span>
              <CitationChip citation={summary.citations[0]} index={1} />
            </div>
          )}
        </div>
      </Tabs>

      {/* Saved summaries */}
      {savedNotes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Saved summaries ({savedNotes.length})
          </div>
          {savedNotes.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800/60"
            >
              <button
                type="button"
                onClick={() => openSaved(n)}
                className="flex-1 min-w-0 text-left truncate text-slate-700 dark:text-slate-300 cursor-pointer"
                title={n.title}
              >
                {n.title}
              </button>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
              <button
                type="button"
                title="Delete summary"
                aria-label={`Delete ${n.title}`}
                onClick={() => setNoteToDelete(n)}
                className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={noteToDelete !== null}
        onOpenChange={(o) => !o && setNoteToDelete(null)}
        itemName={noteToDelete?.title ?? ''}
        description="This saved summary will be deleted. Your document and chats are not affected."
        onConfirm={handleDeleteNote}
      />

      {/* Export Dialog */}
      {summary && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          title={summary.title}
          content={summary.content}
          citations={summary.citations.map((c) => ({
            snippet: c.snippet,
            docName: c.documentName,
          }))}
        />
      )}
    </div>
  );
};